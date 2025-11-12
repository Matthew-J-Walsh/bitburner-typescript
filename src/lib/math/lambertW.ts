const lambertWX: Array<number> = [
    0.0, 0.024955297157393683, 0.05434969988882696, 0.08757181575444925,
    0.12535780147422484, 0.16869306641325657, 0.21879132017753153,
    0.2772822037480433, 0.34632973595843325, 0.4289081728412373,
    0.5291783616343888, 0.6531662821186195, 0.8098966084927751,
    1.0135369431490233, 1.2875407571427655, 1.6736914709060933,
    2.253966071636816, 3.2131329794569425, 5.068815251784311, 10.0, 100.0,
];
const lambertWW: Array<number> = [
    0.0, 0.0243548559972167, 0.05161557739026885, 0.0807762478725318,
    0.11206782165771038, 0.14580573501297925, 0.18232539952002985,
    0.2220651166345314, 0.2655580089764711, 0.31348651187376675,
    0.3667218590656851, 0.42641610302371447, 0.4941227095145066,
    0.5720227146934959, 0.6632848109766334, 0.772785459796716,
    0.908572240768204, 1.085346852026272, 1.334528823666773, 1.7455280027406994,
    3.3856301402,
];

/**
 * Approximate Lambert W using piecewise linear interpolation.
 * @param x Input value
 * @returns Approximate W(x)
 */
export function lambertWApprox(x: number): number {
    const n = lambertWX.length;

    // Clamp to bounds
    if (x <= lambertWX[0]) return lambertWW[0];
    if (x >= lambertWX[n - 1]) return lambertWW[n - 1];

    // Binary search for the interval [x_i, x_{i+1}]
    let low = 0;
    let high = n - 1;
    let i = 0;
    while (i < 1000 && high - low > 1) {
        const mid = (low + high) >> 1;
        if (x < lambertWX[mid]) high = mid;
        else low = mid;
        i += 1;
    }
    if (i === 1000) {
        throw new Error(`Huh? ${x}`);
    }

    // Linear interpolation
    const x0 = lambertWX[low];
    const x1 = lambertWX[high];
    const y0 = lambertWW[low];
    const y1 = lambertWW[high];
    const t = (x - x0) / (x1 - x0);
    return y0 + t * (y1 - y0);
}
