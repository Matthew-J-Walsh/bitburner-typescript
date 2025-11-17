import { NS, Server } from '@ns';
import {
    HackingScript,
    hackFort,
    weakenFort,
    growFort,
    scriptCosts,
    HackScriptType,
    minimalTimeBetweenTwoScriptsEnding,
    growAvgCost,
    hackAvgCost,
    HackingPolicy,
    scriptAvgCosts,
    minimumAllowableBatchRam,
    maximumHackedPercent,
} from '/hacking/constants';
import { lambertWApprox } from '/lib/math/lambertW';

export class HackingUtilityHelpers {
    /**
     * Calculates the hwgw sequence from a starting hack count
     * Forefully lowers the hack count until the hacked percent is < 90%
     * @param ns
     * @param server
     * @param hackCount
     * @returns
     */
    static hwgwSequenceFromHackCount(
        ns: NS,
        server: Server,
        hackCount: number,
    ): HackingScript[] {
        const hackedPercent = ns.hackAnalyze(server.hostname);
        hackCount = Math.min(
            Math.floor(maximumHackedPercent / hackedPercent),
            hackCount,
        );
        //we add a small fraction to make sure we grow with hacknet server effects
        let hackedFraction = hackedPercent * hackCount + 0.01;

        const growthFactor = 1 / (1 - hackedFraction);
        const growCount = Math.ceil(
            ns.growthAnalyze(server.hostname, growthFactor),
        );
        const hackWeakens = Math.ceil((hackCount * hackFort) / weakenFort);
        const growWeakens = Math.ceil((growCount * growFort) / weakenFort);
        return [
            { script: 'hack', threads: hackCount },
            { script: 'weaken', threads: hackWeakens },
            { script: 'grow', threads: growCount },
            { script: 'weaken', threads: growWeakens },
        ];
    }

    /**
     * Finds the maximum ram consumption of a sequence
     * @param sequence
     * @returns
     */
    static sequenceMaxRam(sequence: HackingScript[]): number {
        return sequence.reduce(
            (acc, script) => acc + scriptCosts[script.script] * script.threads,
            0,
        );
    }

    /**
     * Finds the average ram consumption of a sequence,
     * unfortunately this isn't safe as we may start fires early
     * @param sequence
     * @returns
     */
    static sequenceAvgRam(sequence: HackingScript[]): number {
        return sequence.reduce(
            (acc, script) =>
                acc + scriptAvgCosts[script.script] * script.threads,
            0,
        );
    }

    /**
     * Get the number of batches to aim for
     * @param weakenTime Weaken time (one full cycle time)
     * @param structure Structure being used
     * @returns Number of batches to aim for
     */
    public static getBatches(
        weakenTime: number,
        structure: HackScriptType[],
        ramAllocation: number,
    ): number {
        let maxBatches = Math.floor(
            weakenTime /
                ((structure.length - 1) * minimalTimeBetweenTwoScriptsEnding),
        );

        // We cap the number of batches for stability
        maxBatches = Math.min(maxBatches, structure.length === 2 ? 40 : 20);

        while (ramAllocation / maxBatches < minimumAllowableBatchRam)
            maxBatches -= 1;

        return Math.max(maxBatches, 1);
    }

    /**
     * Gets the approximation for sequencing a hack-weaken-grow-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    public static getSequenceHWGW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        if (ramAllocation < minimumAllowableBatchRam || batches === 0)
            return [];

        try {
            const ramPerBatch = ramAllocation / batches;
            const hackPercent = ns.hackAnalyze(target.hostname);
            const growPercentLog = Math.log(
                ns.formulas.hacking.growPercent(target, 1, ns.getPlayer()),
            );

            let hackGuess = Math.floor(
                1 / hackPercent -
                    (growAvgCost / (growPercentLog * hackAvgCost)) *
                        lambertWApprox(
                            ((growPercentLog * hackAvgCost) /
                                (growAvgCost * hackPercent)) *
                                Math.pow(
                                    Math.exp(growPercentLog),
                                    (-1 * ramPerBatch) / growAvgCost,
                                ) *
                                Math.exp(
                                    (growPercentLog * hackAvgCost) /
                                        (growAvgCost * hackPercent),
                                ),
                        ),
            );
            let seq = HackingUtilityHelpers.hwgwSequenceFromHackCount(
                ns,
                target,
                hackGuess,
            );
            let i = 0; //infinite loop prevention
            while (seq[0].threads > 0 && i < 1000) {
                if (!seq) return [];

                let ram = HackingUtilityHelpers.sequenceMaxRam(seq);
                //ns.tprint(
                //    `Looking at sequence with hacks=${hacks}, ram=${ram}, target=${ramPerBatch}`,
                //);
                if (ram <= ramPerBatch) {
                    return seq;
                }
                seq = HackingUtilityHelpers.hwgwSequenceFromHackCount(
                    ns,
                    target,
                    seq[0].threads - 1,
                );
                i += 1;
            }
            if (i === 1000) throw new Error('Infinite loop in hwgw calc');
        } catch (error) {
            ns.tprint(`Unable to form a stable hwgw approximate: ${error}`);
        }
        return [];
    }

    /**
     * Gets the approximation for sequencing a hack-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    public static getSequenceHW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        if (ramAllocation < minimumAllowableBatchRam || batches === 0)
            return [];
        const ramPerBatch = ramAllocation / batches;

        let hackCount = Math.floor(ramPerBatch / hackAvgCost);
        let weakenCount = Math.ceil((hackCount * hackFort) / weakenFort);

        if (hackCount === 0 || weakenCount === 0) {
            ns.alert(
                `WARNING! Under minimums for batch size: ${ramAllocation}, ${batches}, ${hackCount}, ${weakenCount}`,
            );
            return [];
        }

        let seq: HackingScript[] = [
            { script: 'hack', threads: hackCount },
            { script: 'weaken', threads: weakenCount },
        ];

        if (
            HackingUtilityHelpers.sequenceMaxRam(seq) >
            ramPerBatch * 1.05 + 3
        ) {
            ns.alert(
                `Warning! somehow overshot HW RAM: ${ramAllocation}, ${batches}, ${hackCount}, ${weakenCount}, ${HackingUtilityHelpers.sequenceMaxRam(seq)}`,
            );
            return [];
        }

        return seq;
    }

    /**
     * Gets the approximation for sequencing a grow-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    public static getSequenceGW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        if (ramAllocation < minimumAllowableBatchRam || batches === 0)
            return [];
        const ramPerBatch = ramAllocation / batches;

        let growCount = Math.floor(ramPerBatch / growAvgCost);
        let weakenCount = Math.ceil((growCount * growFort) / weakenFort);

        if (growCount === 0 || weakenCount === 0) {
            ns.alert(
                `WARNING! Under minimums for batch size: ${ramAllocation}, ${batches}, ${growCount}, ${weakenCount}`,
            );
            return [];
        }

        let seq: HackingScript[] = [
            { script: 'grow', threads: growCount },
            { script: 'weaken', threads: weakenCount },
        ];

        if (
            HackingUtilityHelpers.sequenceMaxRam(seq) >
            ramPerBatch * 1.05 + 3
        ) {
            ns.alert(
                `Warning! somehow overshot GW RAM: ${ramAllocation}, ${batches}, ${growCount}, ${weakenCount}, ${HackingUtilityHelpers.sequenceMaxRam(seq)}`,
            );
            return [];
        }

        return seq;
    }

    /**
     * Generates a hacking script policy
     * @param ns
     * @param target
     * @param ramAllocation
     * @param structure
     * @param getSeq
     * @returns
     */
    public static generateHackScriptPolicy(
        ns: NS,
        target: Server,
        ramAllocation: number,
        structure: HackScriptType[],
        getSeq: (
            ns: NS,
            target: Server,
            batches: number,
            ramAllocation: number,
        ) => HackingScript[],
    ): HackingPolicy {
        const weakenTime = ns.getWeakenTime(target.hostname);
        const batches = HackingUtilityHelpers.getBatches(
            weakenTime,
            structure,
            ramAllocation,
        );
        return {
            target: target,
            spacing: weakenTime / batches,
            sequence: getSeq(ns, target, batches, ramAllocation),
        };
    }

    /**
     * Evaluates a hacking policies ability to generate money
     * @param ns
     * @param policy
     * @returns
     */
    public static hackPolicyMoneyEval(ns: NS, policy: HackingPolicy): number {
        if (policy.sequence.length !== 4) return 0;
        return (
            (policy.target.moneyMax! *
                ns.hackAnalyze(policy.target.hostname) *
                policy.sequence[0]!.threads) /
            policy.spacing
        );
    }

    /**
     * Evaluates a hacking policies ability to generate money via stock changes
     * @param ns
     * @param policy
     * @returns
     */
    public static hackPolicyStockEval(ns: NS, policy: HackingPolicy): number {
        throw new Error('Not implemented: hackPolicyStockEval');
    }

    /**
     * Evaluates a hacking policies ability to generate exp
     * @param ns
     * @param policy
     * @returns
     */
    public static hackPolicyExpEval(ns: NS, policy: HackingPolicy): number {
        return (
            (ns.formulas.hacking.hackExp(policy.target, ns.getPlayer()) *
                policy.sequence.reduce(
                    (threads, hscript) => threads + hscript.threads,
                    0,
                )) /
            policy.spacing
        );
    }
}
