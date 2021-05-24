import { WidthAndHeight } from './types';

/** @internal */
export function getQueryStringParam(key: string): string | null {
    const matches = location.search.match(new RegExp(key + '=([^&]*)'));
    return matches ? matches[1] : null;
}

/** @internal */
export function numberToPixels(value: number): string {
    return value.toString(10) + 'px';
}

/** @internal */
export function pixelsToNumber(value: string): number {
    const numberStr = value.replace("px", "");
    return parseFloat(numberStr);
}

/** @internal */
export function numberToPercent(value: number): string {
    return value.toString(10) + '%';
}

/** @internal */
export function getElementWidth(element: HTMLElement): number {
    return element.offsetWidth;
}

/** @internal Sets width in pixels  */
export function setElementWidth(element: HTMLElement, width: number): void {
    const widthAsPixels = numberToPixels(width);
    element.style.width = widthAsPixels;
}

/** @internal */
export function setElementWidthPercent(element: HTMLElement, width: number): void {
    const widthAsPercent = numberToPercent(width);
    element.style.width = widthAsPercent;
}

/** @internal */
export function getElementHeight(element: HTMLElement): number {
    return element.offsetHeight;
}

/** @internal Sets height in pixels */
export function setElementHeight(element: HTMLElement, height: number): void {
    const heightAsPixels = numberToPixels(height);
    element.style.height = heightAsPixels;
}

/** @internal */
export function setElementHeightPercent(element: HTMLElement, height: number): void {
    const heightAsPercent = numberToPercent(height);
    element.style.height = heightAsPercent;
}

/** @internal Get width and height as integers */
export function getElementWidthAndHeight(element: HTMLElement): WidthAndHeight {
    return {
        width: element.offsetWidth,
        height: element.offsetHeight,
    };
}

export function getElementFractionWidthAndHeight(element: HTMLElement): WidthAndHeight {
    const rect = element.getBoundingClientRect();
    return {
        width: rect.width,
        height: rect.height
    };
}

/** @internal */
export function setElementDisplayVisibility(element: HTMLElement, visible: boolean): void {
    if (visible) {
        element.style.display = '';
    } else {
        element.style.display = 'none';
    }
}

/**
 * Replacement for JQuery $.extend(target, obj)
 * @internal
*/
export function extend(target: Record<string, unknown>, obj: Record<string, unknown>): Record<string, unknown> {
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            target[key] = obj[key];
        }
    }
    return target;
}

/**
 * Replacement for JQuery $.extend(true, target, obj)
 * @internal
*/
export function deepExtend(target: Record<string, unknown>, obj: Record<string, unknown> | undefined): Record<string, unknown> {
    if (obj !== undefined) {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const value = obj[key];
                const existingTarget = target[key];
                target[key] = deepExtendValue(existingTarget, value);
            }
        }
    }

    return target;
}

/** @internal */
export function deepExtendValue(existingTarget: unknown, value: unknown): unknown {
    if (typeof value !== 'object') {
        return value;
    } else {
        if (Array.isArray(value)) {
            const length = value.length;
            const targetArray = new Array<unknown>(length);
            for (let i = 0; i < length; i++) {
                const element = value[i];
                targetArray[i] = deepExtendValue({}, element);
            }
            return targetArray;
        } else {
            if (value === null) {
                return null;
            } else {
                const valueObj = value as Record<string, unknown>;
                if (existingTarget === undefined) {
                    return deepExtend({}, valueObj); // overwrite
                } else {
                    if (typeof existingTarget !== "object") {
                        return deepExtend({}, valueObj); // overwrite
                    } else {
                        if (Array.isArray(existingTarget)) {
                            return deepExtend({}, valueObj); // overwrite
                        } else {
                            if (existingTarget === null) {
                                return deepExtend({}, valueObj); // overwrite
                            } else {
                                const existingTargetObj = existingTarget as Record<string, unknown>;
                                return deepExtend(existingTargetObj, valueObj); // merge
                            }
                        }
                    }
                }
            }
        }
    }
}

/** @internal */
export function removeFromArray<T>(item: T, array: T[]): void {
    const index = array.indexOf(item);

    if (index === -1) {
        throw new Error('Can\'t remove item from array. Item is not in the array');
    }

    array.splice(index, 1);
}

/** @internal */
export function getUniqueId(): string {
    return (Math.random() * 1000000000000000)
        .toString(36)
        .replace('.', '');
}
