export const approximatelyEqual = (
    v1: number,
    v2: number,
    epsilon: number = 0.01,
): boolean => {
    return Math.abs(v1 - v2) < epsilon;
};
