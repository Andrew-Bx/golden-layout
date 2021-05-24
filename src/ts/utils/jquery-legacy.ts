import { LeftAndTop } from './types'; // TODO ASB: maybe move this type here, if not also used in other contexts?
import { pixelsToNumber } from './utils';

/** @internal */
export interface JQueryOffset { // TODO ASB: rename, eg BodyOffset (and ultimately rename this file?)
    top: number;
    left: number;
}

/** @internal */
export function getJQueryOffset(element: HTMLElement): JQueryOffset { // TODO ASB: rename getBodyOffset? and return LeftAndTop ?
    //                                                                   (hmm.. top and left having different meanings there?)
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top + document.body.scrollTop,
        left: rect.left + document.body.scrollLeft,
    }
}

/** @internal */
export function getJQueryLeftAndTop(element: HTMLElement): LeftAndTop { // TODO ASB: rename, eg getComputedLeftAndTop ?
    const style = getComputedStyle(element, null);
    const leftAndTop: LeftAndTop = {
        left: pixelsToNumber(style.left),
        top: pixelsToNumber(style.top),
    }
    return leftAndTop;
}
