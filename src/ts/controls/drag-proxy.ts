import { UnexpectedNullError } from '../errors/internal-error';
import { ComponentItem } from '../items/component-item';
import { ContentItem } from '../items/content-item';
import { Stack } from '../items/stack';
import { LayoutManager } from '../layout-manager';
import { DomConstants } from '../utils/dom-constants';
import { DragListener } from '../utils/drag-listener';
import { EventEmitter } from '../utils/event-emitter';
import { getBodyOffset } from '../utils/utils';
import { AreaLinkedRect, DropZone, Side } from '../utils/types';
import {
    getElementWidthAndHeight,
    numberToPixels
} from '../utils/utils';

/**
 * This class creates a temporary container
 * for the component whilst it is being dragged
 * and handles drag events
 * @internal
 */
export class DragProxy extends EventEmitter {
    /** currently selected drop zone */
    private _selectedDropZone: DropZone | null = null;
    private _minX: number;
    private _minY: number;
    private _maxX: number;
    private _maxY: number;
    private _sided: boolean;
    private _element: HTMLElement;
    private _proxyContainerElement: HTMLElement;
    private _componentItemFocused: boolean;

    get element(): HTMLElement { return this._element; }

    /**
     * @param x - The initial x position
     * @param y - The initial y position
     * @internal
     */
    constructor(x: number, y: number,
        private readonly _dragListener: DragListener,
        private readonly _layoutManager: LayoutManager,
        private readonly _draggedComponent: ComponentItem,
        private readonly _originalParent: ContentItem) {

        super();

        this._dragListener.on('drag', (offsetX, offsetY, event) => this.onDrag(offsetX, offsetY, event));
        this._dragListener.on('dragStop', () => this.onDrop());

        this.createDragProxyElements(x, y);

        if (this._draggedComponent.parent === null) {
            // Note that _contentItem will have dummy GroundItem as parent if initiated by a external drag source
            throw new UnexpectedNullError('DPC10097');
        }

        this._componentItemFocused = this._draggedComponent.focused;
        if (this._componentItemFocused) {
            this._draggedComponent.blur();
        }
        this._draggedComponent.parent.removeChild(this._draggedComponent, true);

        this.setDimensions();

        document.body.appendChild(this._element);

        this.determineMinMaxXY();
        if (this._layoutManager.layoutConfig.settings.constrainDragToContainer) {
            const constrainedPosition = this.getXYWithinMinMax(x, y);
            x = constrainedPosition.x;
            y = constrainedPosition.y;
        }

        this._layoutManager.retrieveDropZones();
        this.respondToDraggedPosition(x, y);
    }

    /** Create Stack-like structure to contain the dragged component */
    private createDragProxyElements(initialX: number, initialY: number): void {
        this._element = document.createElement('div');
        this._element.classList.add(DomConstants.ClassName.DragProxy);
        const headerElement = document.createElement('div');
        headerElement.classList.add(DomConstants.ClassName.Header);
        const tabsElement = document.createElement('div');
        tabsElement.classList.add(DomConstants.ClassName.Tabs);
        const tabElement = document.createElement('div');
        tabElement.classList.add(DomConstants.ClassName.Tab);
        const titleElement = document.createElement('span');
        titleElement.classList.add(DomConstants.ClassName.Title);
        tabElement.appendChild(titleElement);
        tabsElement.appendChild(tabElement);
        headerElement.appendChild(tabsElement);

        this._proxyContainerElement = document.createElement('div');
        this._proxyContainerElement.classList.add(DomConstants.ClassName.Content);

        this._element.appendChild(headerElement);
        this._element.appendChild(this._proxyContainerElement);

        if (this._originalParent instanceof Stack && this._originalParent.headerShow) {
            this._sided = this._originalParent.headerLeftRightSided;
            this._element.classList.add('lm_' + this._originalParent.headerSide);
            if ([Side.right, Side.bottom].indexOf(this._originalParent.headerSide) >= 0) {
                this._proxyContainerElement.insertAdjacentElement('afterend', headerElement);
            }
        }
        this._element.style.left = numberToPixels(initialX);
        this._element.style.top = numberToPixels(initialY);
        tabElement.setAttribute('title', this._draggedComponent.title);
        titleElement.insertAdjacentText('afterbegin', this._draggedComponent.title);
        this._proxyContainerElement.appendChild(this._draggedComponent.element);
    }

    private determineMinMaxXY(): void {
        const offset = getBodyOffset(this._layoutManager.container);
        this._minX = offset.left;
        this._minY = offset.top;
        const { width: containerWidth, height: containerHeight } = getElementWidthAndHeight(this._layoutManager.container);
        this._maxX = containerWidth + this._minX;
        this._maxY = containerHeight + this._minY;
    }

    private getXYWithinMinMax(x: number, y: number): {x: number, y: number} {
        if (x <= this._minX) {
            x = Math.ceil(this._minX + 1);
        } else if (x >= this._maxX) {
            x = Math.floor(this._maxX - 1);
        }

        if (y <= this._minY) {
            y = Math.ceil(this._minY + 1);
        } else if (y >= this._maxY) {
            y = Math.floor(this._maxY - 1);
        }

        return {x,y};
    }

    /**
     * Callback on every mouseMove event during a drag. Determines if the drag is
     * still within the valid drag area and calls the layoutManager to highlight the
     * current drop area
     *
     * @param offsetX - The difference from the original x position in px
     * @param offsetY - The difference from the original y position in px
     * @param event -
     * @internal
     */
    private onDrag(offsetX: number, offsetY: number, event: PointerEvent) {

        const x = event.pageX;
        const y = event.pageY;

        if (!this._layoutManager.layoutConfig.settings.constrainDragToContainer) {
            this.respondToDraggedPosition(x, y);
        } else {
            const isWithinContainer = x > this._minX && x < this._maxX && y > this._minY && y < this._maxY;
            if (isWithinContainer) {
                this.respondToDraggedPosition(x, y);
            }
        }

        this._draggedComponent.drag();
    }

    private respondToDraggedPosition(x: number, y: number): void {
        this.updateDragProxyPosition(x, y);
        this.highlightDropZoneForPosition(x, y);
    }

    private updateDragProxyPosition(x: number, y: number): void {
        this._element.style.left = numberToPixels(x);
        this._element.style.top = numberToPixels(y);
    }

    private highlightDropZoneForPosition(x: number, y: number): void {
        const selectedDropZone = this._layoutManager.getSelectedDropZoneForPointerPosition(x, y);

        // if newArea is null (ie current position is not a valid drop zone)
        // then keep the last valid drop zone
        if (selectedDropZone !== null) {
            this.highlightDropZone(selectedDropZone.highlightArea);
            selectedDropZone.onHoverCallback?.();
            this._selectedDropZone = selectedDropZone;
        }
        // TODO ASB: if area being set here were actually the specific drop zone (eg tab header)
        // then we could keep track of whether the newly selected area is the same as the old one,
        // and then when it changes, tell the old one to clear itself up (which might include removing
        // the tabDropPlaceholder, so that other non-stack content items don't need to know anything about it)
        // (could also clear up stack's contentItem array... or maybe should just tell all areas to clear-up
        //  when the item is dropped, ie the drag ends?)
        //
        // this.layoutManager.tabDropPlaceholder.remove();
    }

    private highlightDropZone(area: AreaLinkedRect): void {
        // TODO ASB: move dropTargetIndicator from layoutManager to dragProxy class
        const dropTargetIndicator = this._layoutManager.dropTargetIndicator;
        if (dropTargetIndicator === null) {
            throw new UnexpectedNullError('DPOD30010');
        }
        dropTargetIndicator.highlightArea(area);
    }

    /**
     * Callback when the drag has finished. Determines the drop area
     * and adds the child to it
     * @internal
     */
    private onDrop(): void {
        const dropTargetIndicator = this._layoutManager.dropTargetIndicator;
        if (dropTargetIndicator === null) {
            throw new UnexpectedNullError('DPOD30011');
        }
        dropTargetIndicator.hide();

        this._draggedComponent.exitDragMode();

        /*
         * A valid drop area is currently highlighted
         */
        let droppedComponentItem: ComponentItem | undefined;
        if (this._selectedDropZone !== null) {
            droppedComponentItem = this._draggedComponent;
            this._selectedDropZone.onDrop(droppedComponentItem);

            /**
             * No valid drop area found during the duration of the drag. Return
             * content item to its original position if a original parent is provided.
             * (Which is not the case if the drag had been initiated by createDragSource)
             */
        } else if (this._originalParent) {
            droppedComponentItem = this._draggedComponent;
            this._originalParent.addChild(droppedComponentItem);

            /**
             * The drag didn't ultimately end up with adding the content item to
             * any container. In order to ensure clean up happens, destroy the
             * content item.
             */
        } else {
            this._draggedComponent.destroy(); // contentItem children are now destroyed as well
        }

        this._element.remove();

        this._layoutManager.emit('itemDropped', this._draggedComponent);

        if (this._componentItemFocused && droppedComponentItem !== undefined) {
            droppedComponentItem.focus();
        }
    }

    /**
     * Updates the Drag Proxy's dimensions
     * @internal
     */
    private setDimensions() {
        const dimensions = this._layoutManager.layoutConfig.dimensions;
        if (dimensions === undefined) {
            throw new Error('DragProxy.setDimensions: dimensions undefined');
        }

        let width = dimensions.dragProxyWidth;
        let height = dimensions.dragProxyHeight;
        if (width === undefined || height === undefined) {
            throw new Error('DragProxy.setDimensions: width and/or height undefined');
        }

        const headerHeight = this._layoutManager.layoutConfig.header.show === false ? 0 : dimensions.headerHeight;
        this._element.style.width = numberToPixels(width);
        this._element.style.height = numberToPixels(height)
        width -= (this._sided ? headerHeight : 0);
        height -= (!this._sided ? headerHeight : 0);
        this._proxyContainerElement.style.width = numberToPixels(width);
        this._proxyContainerElement.style.height = numberToPixels(height);
        this._draggedComponent.enterDragMode(width, height);
        this._draggedComponent.show();
    }
}
