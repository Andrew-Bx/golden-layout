import { ComponentItemConfig, ItemConfig, RowOrColumnItemConfig, StackItemConfig } from '../config/config';
import { ResolvedComponentItemConfig, ResolvedGroundItemConfig, ResolvedHeaderedItemConfig, ResolvedItemConfig, ResolvedRootItemConfig, ResolvedStackItemConfig } from '../config/resolved-config';
import { AssertError } from '../errors/internal-error';
import { LayoutManager } from '../layout-manager';
import { DomConstants } from '../utils/dom-constants';
import { DropZone, ItemType } from '../utils/types';
import { getElementWidthAndHeight, setElementHeight, setElementWidth } from '../utils/utils';
import { ComponentItem } from './component-item';
import { ComponentParentableItem } from './component-parentable-item';
import { ContentItem } from './content-item';
import { RowOrColumn } from './row-or-column';
import { Stack } from './stack';

/**
 * GroundItem is the ContentItem whose one child is the root ContentItem (Root is planted in Ground).
 * (Previously it was called root however this was incorrect as its child is the root item)
 * There is only one instance of GroundItem and it is automatically created by the Layout Manager
 * @internal
 */
export class GroundItem extends ComponentParentableItem {
    private static createElement(document: Document): HTMLDivElement {
        const element = document.createElement('div');
        element.classList.add(DomConstants.ClassName.GoldenLayout);
        element.classList.add(DomConstants.ClassName.Item);
        element.classList.add(DomConstants.ClassName.Root);
        return element;
    }

    private readonly _childElementContainer: HTMLElement;
    private readonly _containerElement: HTMLElement;

    constructor(layoutManager: LayoutManager, rootItemConfig: ResolvedRootItemConfig | undefined, containerElement: HTMLElement) {

        super(layoutManager, ResolvedGroundItemConfig.create(rootItemConfig), null, GroundItem.createElement(document));

        this.isGround = true;
        this._childElementContainer = this.element;
        this._containerElement = containerElement;

        // insert before any pre-existing content elements
        let before = null;
        while (true) {
            const prev: ChildNode | null =
                before ? before.previousSibling : this._containerElement.lastChild;
            if (prev instanceof Element
                && prev.classList.contains(DomConstants.ClassName.Content)) {
                before = prev;
            } else {
                break;
            }
        }
        this._containerElement.insertBefore(this.element, before);
    }

    override init(): void {
        if (this.isInitialised === true) return;

        this.updateNodeSize();

        for (let i = 0; i < this.contentItems.length; i++) {
            this._childElementContainer.appendChild(this.contentItems[i].element);
        }

        super.init();

        this.initContentItems();
    }

    /**
     * Loads a new Layout
     * Internal only.  To load a new layout with API, use {@link (LayoutManager:class).loadLayout}
     */
    loadRoot(rootItemConfig: ResolvedRootItemConfig | undefined): void {
        // Remove existing root if it exists
        this.clearRoot();

        if (rootItemConfig !== undefined) {
            const rootContentItem = this.layoutManager.createAndInitContentItem(rootItemConfig, this);
            this.addChild(rootContentItem, 0);
        }
    }

    clearRoot(): void {
        // Remove existing root if it exists
        const contentItems = this.contentItems;
        switch (contentItems.length) {
            case 0: {
                return;
            }
            case 1: {
                const existingRootContentItem = contentItems[0];
                existingRootContentItem.remove();
                return;
            }
            default: {
                throw new AssertError('GILR07721');
            }
        }
    }

    /**
     * Adds a ContentItem child to root ContentItem.
     * Internal only.  To load a add with API, use {@link (LayoutManager:class).addItem}
     * @returns -1 if added as root otherwise index in root ContentItem's content
     */
    addItem(itemConfig: RowOrColumnItemConfig | StackItemConfig | ComponentItemConfig,
        index?: number
    ): number {
        this.layoutManager.checkMinimiseMaximisedStack();

        const resolvedItemConfig = ItemConfig.resolve(itemConfig);
        let parent: ContentItem;
        if (this.contentItems.length > 0) {
            parent = this.contentItems[0];
        } else {
            parent = this;
        }
        if (parent.isComponent) {
            throw new Error('Cannot add item as child to ComponentItem');
        } else {
            const contentItem = this.layoutManager.createAndInitContentItem(resolvedItemConfig, parent);
            index = parent.addChild(contentItem, index);
            return (parent === this) ? -1 : index;
        }
    }

    loadComponentAsRoot(itemConfig: ComponentItemConfig): void {
        // Remove existing root if it exists
        this.clearRoot();

        const resolvedItemConfig = ItemConfig.resolve(itemConfig) as ResolvedComponentItemConfig;

        if (resolvedItemConfig.maximised) {
            throw new Error('Root Component cannot be maximised');
        } else {
            const rootContentItem = new ComponentItem(this.layoutManager, resolvedItemConfig, this);
            rootContentItem.init();
            this.addChild(rootContentItem, 0);
        }
    }

    /**
     * Adds a Root ContentItem.
     * Internal only.  To replace Root ContentItem with API, use {@link (LayoutManager:class).loadLayout}
     */
    override addChild(contentItem: ContentItem, index?: number): number {
        if (this.contentItems.length > 0) {
            throw new Error('Ground node can only have a single child');
        } else {
            // contentItem = this.layoutManager._$normalizeContentItem(contentItem, this);
            this._childElementContainer.appendChild(contentItem.element);
            index = super.addChild(contentItem, index);

            this.updateSize(false);
            this.emitBaseBubblingEvent('stateChanged');

            return index;
        }
    }

    /** @internal */
    override calculateConfigContent(): ResolvedRootItemConfig[] {
        const contentItems = this.contentItems;
        const count = contentItems.length;
        const result = new Array<ResolvedRootItemConfig>(count);
        for (let i = 0; i < count; i++) {
            const item = contentItems[i];
            const itemConfig = item.toConfig();
            if (ResolvedRootItemConfig.isRootItemConfig(itemConfig)) {
                result[i] = itemConfig;
            } else {
                throw new AssertError('RCCC66832');
            }
        }
        return result;
    }

    /** @internal */
    setSize(width: number, height: number): void {
        if (width === undefined || height === undefined) {
            this.updateSize(false); // For backwards compatibility with v1.x API
        } else {
            setElementWidth(this.element, width);
            setElementHeight(this.element, height);

            // GroundItem can be empty
            if (this.contentItems.length > 0) {
                setElementWidth(this.contentItems[0].element, width);
                setElementHeight(this.contentItems[0].element, height);
            }

            this.updateContentItemsSize(false);
        }
    }

    /**
     * Adds a Root ContentItem.
     * Internal only.  To replace Root ContentItem with API, use {@link (LayoutManager:class).updateRootSize}
     * @internal
     */
    override updateSize(force: boolean): void {
        this.layoutManager.beginVirtualSizedContainerAdding();
        try {
            this.updateNodeSize();
            this.updateContentItemsSize(force);
        } finally {
            this.layoutManager.endVirtualSizedContainerAdding();
        }
    }

    /** @internal */
    getAllDropZones(): DropZone[] {
        const dropZones: DropZone[] = [];
        
        if (this.contentItems.length === 0) {
            // No root ContentItem (just Ground ContentItem)
            dropZones.push(this.getDropZoneForEntireArea());
        }
        else if (!this.contentItems[0].isStack) {
            dropZones.push(...this.getEdgeDropZones());
        }
        return dropZones;
    }

    private getDropZoneForEntireArea(): DropZone {
        const entireArea = this.getElementArea();
        return {
            description: `whole ground item`,
            contentItem: this,
            onDrop: (droppedItem: ComponentItem) => {
                // TODO ASB: Still need to wrap ths component in a stack...
                //  .... although it might be nicer if RowOrColumn was responsible for wrapping an added component in a stack?
                const newStack = this.wrapItemInStack(droppedItem);

                // TODO ASB: once we support 'fixed' row/columns, will have to support empty stacks in
                //   the layout, and thus possibility of dropping onto an empty stack.  In that case,
                //   easier to make an 'empty ground item' actually be an empty stack, and not have to deal
                //   with this explicitly here?
                this.addChild(newStack);
            },
            hoverArea: {...entireArea},
            highlightArea: {...entireArea}
        };
    }

    private getEdgeDropZones(): DropZone[] {
        const dropZones: DropZone[] = [];
        if (this.contentItems[0].isRow) {
            dropZones.push(...this.getTopBottomEdgeDropZones());
        }
        else if (this.contentItems[0].isColumn) {
            dropZones.push(...this.getLeftRightEdgeDropZones());
        }
        // else, for a stack don't get any edge drop zones (the stack will provide them itself)

        return dropZones;
    }

    private getLeftRightEdgeDropZones(): DropZone[] {
        const area = this.getElementArea();
        const halfWidth = (area.x2 - area.x1) / 2;
        
        const hoverAreaWidth = halfWidth;
        const highlightAreaWidth = Math.min(halfWidth, 50); // TODO ASB: minus splitter width?

        const dropZones: DropZone[] = [
            {
                description: 'ground item left edge',
                contentItem: this,
                onDrop: (droppedItem: ComponentItem) => {
                    this.wrapChildInContainerAndAddItem(ItemType.row, droppedItem, 0);
                },
                hoverArea: {
                    x1: area.x1,
                    x2: area.x1 + hoverAreaWidth,
                    y1: area.y1,
                    y2: area.y2
                },
                highlightArea: {
                    x1: area.x1,
                    x2: area.x1 + highlightAreaWidth,
                    y1: area.y1,
                    y2: area.y2
                }
            },
            {
                description: 'ground item right edge',
                contentItem: this,
                onDrop: (droppedItem: ComponentItem) => {
                    this.wrapChildInContainerAndAddItem(ItemType.row, droppedItem, undefined);
                },
                hoverArea: {
                    x1: area.x2 - hoverAreaWidth,
                    x2: area.x2,
                    y1: area.y1,
                    y2: area.y2
                },
                highlightArea: {
                    x1: area.x2 - highlightAreaWidth,
                    x2: area.x1,
                    y1: area.y1,
                    y2: area.y2
                }
            }
        ];
        return dropZones;
    }

    private getTopBottomEdgeDropZones(): DropZone[] {
        const area = this.getElementArea();
        const halfHeight = (area.y2 - area.y1) / 2;
        
        const hoverAreaHeight = halfHeight;
        const highlightAreaHeight = Math.min(halfHeight, 50); // TODO ASB: minus splitter width?

        const dropZones: DropZone[] = [
            {
                description: 'ground item top edge',
                contentItem: this,
                onDrop: (droppedItem: ComponentItem) => {
                    this.wrapChildInContainerAndAddItem(ItemType.column, droppedItem, 0);
                },
                hoverArea: {
                    x1: area.x1,
                    x2: area.x2,
                    y1: area.y1,
                    y2: area.y1 + hoverAreaHeight
                },
                highlightArea: {
                    x1: area.x1,
                    x2: area.x2,
                    y1: area.y1,
                    y2: area.y1 + highlightAreaHeight
                }
            },
            {
                description: 'ground item bottom edge',
                contentItem: this,
                onDrop: (droppedItem: ComponentItem) => {
                    this.wrapChildInContainerAndAddItem(ItemType.column, droppedItem, undefined);
                },
                hoverArea: {
                    x1: area.x1,
                    x2: area.x2,
                    y1: area.y2 - hoverAreaHeight,
                    y2: area.y2
                },
                highlightArea: {
                    x1: area.x1,
                    x2: area.x2,
                    y1: area.y2 - highlightAreaHeight,
                    y2: area.y2
                }
            }
        ];
        return dropZones;
    }

    private wrapItemInStack(item: ComponentItem): Stack {
        const stackConfig = ResolvedStackItemConfig.createDefault();
        stackConfig.header = ResolvedHeaderedItemConfig.Header.createCopy(item.headerConfig);
        const newStack = this.layoutManager.createAndInitContentItem(stackConfig, this) as Stack;
        newStack.addChild(item);
        return newStack;
    }

    private wrapChildInContainerAndAddItem(
        containerType: Extract<ItemType, 'row'|'column'>,
        itemToAdd: ComponentItem,
        addAtPosition: number|undefined): void {

        const currentChild = this.contentItems[0];

        // TODO ASB: Still need to wrap ths component in a stack...
        //  .... although it might be nicer if RowOrColumn was responsible for wrapping an added component in a stack?
        const newStack = this.wrapItemInStack(itemToAdd);

        const wrapperContainerConfig = ResolvedItemConfig.createDefault(containerType);
        const wrapperContainer = this.layoutManager.createContentItem(wrapperContainerConfig, this) as RowOrColumn;
        this.replaceChild(currentChild, wrapperContainer);
        wrapperContainer.addChild(currentChild);
        wrapperContainer.addChild(newStack, addAtPosition, true);
        currentChild[wrapperContainer.dimension] = 50;
        newStack[wrapperContainer.dimension] = 50;
        wrapperContainer.updateSize(false);   
    }

    // TODO ASB: remove obsolete function?
    // No ContentItem can dock with groundItem.  However Stack can have a GroundItem parent and Stack requires that
    // its parent implement dock() function.  Accordingly this function is implemented but throws an exception as it should
    // never be called
    dock(): void {
        throw new AssertError('GID87731');
    }

    // TODO ASB: remove obsolete function?
    // No ContentItem can dock with groundItem.  However Stack can have a GroundItem parent and Stack requires that
    // its parent implement validateDocking() function.  Accordingly this function is implemented but throws an exception as it should
    // never be called
    validateDocking(): void {
        throw new AssertError('GIVD87732');
    }

    getAllContentItems(): ContentItem[] {
        const result: ContentItem[] = [this];
        this.deepGetAllContentItems(this.contentItems, result);
        return result;
    }

    getConfigMaximisedItems(): ContentItem[] {
        const result: ContentItem[] = [];
        this.deepFilterContentItems(this.contentItems, result, (item) => {
            if (ContentItem.isStack(item) && item.initialWantMaximise) {
                return true;
            } else {
                if (ContentItem.isComponentItem(item) && item.initialWantMaximise) {
                    return true;
                } else {
                    return false;
                }
            }
        });

        return result;
    }

    getItemsByPopInParentId(popInParentId: string): ContentItem[] {
        const result: ContentItem[] = [];
        this.deepFilterContentItems(this.contentItems, result, (item) => item.popInParentIds.includes(popInParentId));
        return result;
    }

    toConfig(): ResolvedItemConfig {
        throw new Error('Cannot generate GroundItem config');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setActiveComponentItem(item: ComponentItem, focus: boolean, suppressFocusEvent: boolean): void {
        // only applicable if ComponentItem is root and then it always has focus
    }

    private updateNodeSize(): void {
        const { width, height } = getElementWidthAndHeight(this._containerElement);

        setElementWidth(this.element, width);
        setElementHeight(this.element, height);

        /*
         * GroundItem can be empty
         */
        if (this.contentItems.length > 0) {
            setElementWidth(this.contentItems[0].element, width);
            setElementHeight(this.contentItems[0].element, height);
        }
    }

    // TODO ASB maybe static, not really specific to ground-item ?
    private deepGetAllContentItems(content: readonly ContentItem[], result: ContentItem[]): void {
        for (let i = 0; i < content.length; i++) {
            const contentItem = content[i];
            result.push(contentItem);
            this.deepGetAllContentItems(contentItem.contentItems, result);
        }
    }

    private deepFilterContentItems(content: readonly ContentItem[], result: ContentItem[],
        checkAcceptFtn: ((this: void, item: ContentItem) => boolean)
    ): void {
        for (let i = 0; i < content.length; i++) {
            const contentItem = content[i];
            if (checkAcceptFtn(contentItem)) {
                result.push(contentItem);
            }
            this.deepFilterContentItems(contentItem.contentItems, result, checkAcceptFtn);
        }
    }

}
