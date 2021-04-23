import { ComponentItemConfig, ItemConfig, RowOrColumnItemConfig, StackItemConfig } from '../config/config';
import { ResolvedComponentItemConfig, ResolvedGroundItemConfig, ResolvedHeaderedItemConfig, ResolvedItemConfig, ResolvedRootItemConfig, ResolvedStackItemConfig } from '../config/resolved-config';
import { AssertError, UnexpectedNullError } from '../errors/internal-error';
import { LayoutManager } from '../layout-manager';
import { DomConstants } from '../utils/dom-constants';
import { AreaLinkedRect, ItemType } from '../utils/types';
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
    private readonly _childElementContainer: HTMLElement;
    private readonly _containerElement: HTMLElement;

    constructor(layoutManager: LayoutManager, rootItemConfig: ResolvedRootItemConfig | undefined, containerElement: HTMLElement) {

        super(layoutManager, ResolvedGroundItemConfig.create(rootItemConfig), null, GroundItem.createElement(document));

        this.isGround = true;
        this._childElementContainer = this.element;
        this._containerElement = containerElement;
    }

    init(): void {
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
    addChild(contentItem: ContentItem, index?: number): number {
        if (this.contentItems.length > 0) {
            throw new Error('Ground node can only have a single child');
        } else {
            // contentItem = this.layoutManager._$normalizeContentItem(contentItem, this);
            this._childElementContainer.appendChild(contentItem.element);
            index = super.addChild(contentItem, index);

            this.updateSize();
            this.emitBaseBubblingEvent('stateChanged');

            return index;
        }
    }

    /** @internal */
    calculateConfigContent(): ResolvedRootItemConfig[] {
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
    setSize(width?: number, height?: number): void {
        if (width === undefined || height === undefined) {
            this.updateSize(); // For backwards compatibility with v1.x API
        } else {
            // TODO ASB: should we ever be getting here? (ie setting explicit size on ground-item; now going to rely on grid percentage sizing?)
            setElementWidth(this.element, width);
            setElementHeight(this.element, height);

            // GroundItem can be empty
            if (this.contentItems.length > 0) {
                setElementWidth(this.contentItems[0].element, width);
                setElementHeight(this.contentItems[0].element, height);
            }

            this.updateContentItemsSize();
        }
    }

    /**
     * @internal  To update size with API, use {@link (LayoutManager:class).updateRootSize}
     */
    updateSize(): void {
        this.updateNodeSize();
        this.updateContentItemsSize();
    }

    /**
     * Get the areas onto which a dragged item could be dropped
     *  @internal
     */
    getDropZoneAreas(): ContentItem.Area[] {
        const dropZones: ContentItem.Area[] = [];
        /**
         * If the last item is dragged out, highlight the entire GroundItem to
         * allow to re-dropping on it. this.contentiItems.length === 0 at this point
         *
         * But don't include the ground item iself into the possible drop areas otherwise it
         * will used for every gap in the layout, e.g. splitters
         */
        if (this.contentItems.length === 0) {
            // just the Ground ContentItem
            const groundArea = this.getElementArea();
            dropZones.push(groundArea);
            return dropZones; // TODO ASB avoid early returns?
        }

        const rootItem = this.contentItems[0];
        if (rootItem.isStack) {
            // if root item is Stack, then split Stack and sides of GroundItem are same, so skip sides
        } else if (rootItem.isRow) {
            dropZones.push(...this.getTopBottomEdgeDropZones());
        } else if (rootItem.isColumn) {
            dropZones.push(...this.getLeftRightEdgeDropZones());
        }

        const allContentItems = this.getAllContentItems();
        const stackItems = allContentItems.filter((item) => ContentItem.isStack(item)) as Stack[];
        for (const stack of stackItems) {
            const areas = stack.getAreas();

            if (areas === null) {
                continue;
            }

            dropZones.push(...areas);
        }

        return dropZones;
    }

    /** @internal */
    getLeftRightEdgeDropZones(): readonly [GroundItem.Area, GroundItem.Area] {
        const dropZones = [this.createDropZoneForSide('x1'), this.createDropZoneForSide('x2')] as const;
        return dropZones;
    }
    /** @internal */
    getTopBottomEdgeDropZones(): readonly [GroundItem.Area, GroundItem.Area] {
        const dropZones = [this.createDropZoneForSide('y1'), this.createDropZoneForSide('y2')] as const;
        return dropZones;
    }

    private createDropZoneForSide(side: keyof GroundItem.Area.Sides): GroundItem.Area {
        const areaSize = 50;

        const area = this.getElementArea() as GroundItem.Area;
        if (area === null) {
            throw new UnexpectedNullError('RCSA77553');
        }
        area.side = side;

        const oppositeSides = GroundItem.Area.oppositeSides;
        if (oppositeSides[side][1] === '2' )
            area[side] = area[oppositeSides[side]] - areaSize;
        else
            area[side] = area[oppositeSides[side]] + areaSize;
        area.surface = (area.x2 - area.x1) * (area.y2 - area.y1);
        return area;
    }

    highlightDropZone(x: number, y: number, area: AreaLinkedRect): void {
        this.layoutManager.tabDropPlaceholder.remove();
        super.highlightDropZone(x, y, area);
    }

    onDrop(contentItem: ContentItem, area: GroundItem.Area): void {

        if (contentItem.isComponent) {
            const itemConfig = ResolvedStackItemConfig.createDefault();
            // since ResolvedItemConfig.contentItems not set up, we need to add header from Component
            const component = contentItem as ComponentItem;
            itemConfig.header = ResolvedHeaderedItemConfig.Header.createCopy(component.headerConfig);
            const stack = this.layoutManager.createAndInitContentItem(itemConfig, this);
            stack.addChild(contentItem);
            contentItem = stack;
        }

        if (this.contentItems.length === 0) {
            this.addChild(contentItem);
        } else {
            /*
             * If the contentItem that's being dropped is not dropped on a Stack (cases which just passed above and
             * which would wrap the contentItem in a Stack) we need to check whether contentItem is a RowOrColumn.
             * If it is, we need to re-wrap it in a Stack like it was when it was dragged by its Tab (it was dragged!).
             */
            if(contentItem.type === ItemType.row || contentItem.type === ItemType.column){
                const itemConfig = ResolvedStackItemConfig.createDefault();
                const stack = this.layoutManager.createContentItem(itemConfig, this);
                stack.addChild(contentItem)
                contentItem = stack
            }

            const type = area.side[0] == 'x' ? ItemType.row : ItemType.column;
            const dimension = area.side[0] == 'x' ? 'width' : 'height';
            const insertBefore = area.side[1] == '2';
            const column = this.contentItems[0];
            if (!(column instanceof RowOrColumn) || column.type !== type) {
                const itemConfig = ResolvedItemConfig.createDefault(type);
                const rowOrColumn = this.layoutManager.createContentItem(itemConfig, this);
                this.replaceChild(column, rowOrColumn);
                rowOrColumn.addChild(contentItem, insertBefore ? 0 : undefined, true);
                rowOrColumn.addChild(column, insertBefore ? undefined : 0, true);
                column[dimension] = 50;
                contentItem[dimension] = 50;
                rowOrColumn.updateSize();
            } else {
                const sibling = column.contentItems[insertBefore ? 0 : column.contentItems.length - 1]
                column.addChild(contentItem, insertBefore ? 0 : undefined, true);
                sibling[dimension] *= 0.5;
                contentItem[dimension] = sibling[dimension];
                column.updateSize();
            }
        }
    }

    // No ContentItem can dock with groundItem.  However Stack can have a GroundItem parent and Stack requires that
    // its parent implement dock() function.  Accordingly this function is implemented but throws an exception as it should
    // never be called
    dock(): void {
        throw new AssertError('GID87731');
    }

    // No ContentItem can dock with groundItem.  However Stack can have a GroundItem parent and Stack requires that
    // its parent implement validateDocking() function.  Accordingly this function is implemented but throws an exception as it should
    // never be called
    validateDocking(): void {
        throw new AssertError('GIVD87732');
    }

    /**
     * Returns a flattened array of all content items,
     * regardles of level or type
     * @internal
     */
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
        // TODO ASB: no longer setting size of ground item (it's controlled by grid)
        // const { width, height } = getElementWidthAndHeight(this._containerElement);
        const { width, height } = getElementWidthAndHeight(this.element);

        // setElementWidth(this.element, width);
        // setElementHeight(this.element, height);

        /*
         * GroundItem can be empty
         */
        if (this.contentItems.length > 0) {
            // TODO ASB: hopefully ultimately don't need to do this; root item can just have width and height 100% (of ground item)?
            setElementWidth(this.contentItems[0].element, width);
            setElementHeight(this.contentItems[0].element, height);
        }
    }

    private clearRoot() {
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

/** @internal */
export namespace GroundItem {
    export interface Area extends ContentItem.Area {
        side: keyof typeof Area.Side;
    }

    export namespace Area {
        export const enum Side {
            y2,
            x2,
            y1,
            x1,
        }

        export type Sides = { [side in keyof typeof Side]: keyof typeof Side; }

        export const oppositeSides: Sides = {
            y2: 'y1',
            x2: 'x1',
            y1: 'y2',
            x1: 'x2',
        };
    }

    export function createElement(document: Document): HTMLDivElement {
        const element = document.createElement('div');
        // TODO ASB: breaking backwards compatibility? (are any of the css classes considered part of public API?)
        // element.classList.add(DomConstants.ClassName.GoldenLayout);
        element.classList.add(DomConstants.ClassName.Item);
        element.classList.add(DomConstants.ClassName.Root);
        return element;
    }
}
