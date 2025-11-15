/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const delay = ns.args[1];
    const endTime = ns.args[2];
    //ns.tprint(
    //    `Starting a weaken toward ${target} at time ${Date.now()} with delay ${delay} to end after time ${endTime}`,
    //);
    await ns.weaken(target, { additionalMsec: delay });
    const trueEnd = Date.now();
    ns.write(
        `logs/scripts/${target}ends.txt`,
        `weaken ${trueEnd - endTime}\n`,
        'a',
    );
    //ns.tprint(
    //    `Finished a weaken toward ${target} at time ${Date.now()}, was off by ${Date.now() - endTime}`,
    //);
}
