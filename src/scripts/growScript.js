/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const triggerTime = ns.args[1];
    const startTime = ns.args[2];
    const endTime = ns.args[3];
    let delay = Math.floor(startTime - Date.now());
    if (delay < 0) {
        ns.tprint(
            `Negative delay ${triggerTime}, ${Date.now()}, ${startTime}, ${endTime}`,
        );
        delay = 0;
    }
    //ns.tprint(
    //    `Starting a grow toward ${target} at time ${Date.now()} with delay ${delay} to end after time ${endTime}`,
    //);
    await ns.grow(target, { additionalMsec: delay });
    const trueEnd = Date.now();
    ns.write(
        `logs/scripts/${target}ends.txt`,
        `${Date.now()} grow ${trueEnd - endTime}\n`,
        'a',
    );
    //ns.tprint(
    //    `Finished a grow toward ${target} at time ${Date.now()}, was off by ${Date.now() - endTime}`,
    //);
}
