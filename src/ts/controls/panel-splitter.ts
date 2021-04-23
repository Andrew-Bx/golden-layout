import { DomConstants } from '../utils/dom-constants';
import { DragListener } from '../utils/drag-listener';
import { EventEmitter } from '../utils/event-emitter';
import { numberToPixels } from '../utils/utils';

/**
 * A draggable divider between panels
 *  @internal
 */
export class PanelSplitter {
    private _grabSize;
    private _dragListener: DragListener;

    private readonly _element: HTMLDivElement;

    get element(): HTMLDivElement { return this._element; }

    constructor(private _isVertical: boolean, private _size: number, grabSize: number) {
        this._grabSize = grabSize < this._size ? this._size : grabSize;

        this._element = document.createElement('div');
        this._element.classList.add(DomConstants.ClassName.PanelSplitter);
        const dragHandleElement = document.createElement('div');
        dragHandleElement.classList.add(DomConstants.ClassName.DragHandle);

        const handleExcessSize = this._grabSize - this._size;
        const handleExcessPos = handleExcessSize / 2;

        if (this._isVertical) {
            this._element.classList.add(DomConstants.ClassName.Vertical);
            this.element.style.width = "100%";
            this.element.style.height = numberToPixels(this._size);
            this.element.style.top = numberToPixels(-this._size);

            dragHandleElement.style.top = numberToPixels(-handleExcessPos);
            dragHandleElement.style.height = numberToPixels(this._size + handleExcessSize);
        } else {
            this._element.classList.add(DomConstants.ClassName.Horizontal);
            this.element.style.height = "100%";
            this.element.style.width = numberToPixels(this._size);
            this.element.style.left = numberToPixels(-this._size);

            dragHandleElement.style.left = numberToPixels(-handleExcessPos);
            dragHandleElement.style.width = numberToPixels(this._size + handleExcessSize);
        }

        this._element.appendChild(dragHandleElement);

        this._dragListener = new DragListener(this._element, [dragHandleElement]);
    }

    destroy(): void {
        this._element.remove();
        // TODO ASB: destroy DragListener?
    }

    on<K extends keyof EventEmitter.EventParamsMap>(eventName: K, callback: EventEmitter.Callback<K>): void {
        this._dragListener.on<K>(eventName, callback);
    }
}
