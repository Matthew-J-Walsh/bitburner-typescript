import { NS, ScriptArg } from '@ns';

export async function main(ns: NS): Promise<void> {
    ns.tprint('Hello Remote API!');
    ns.tprint(ns.heart.break());
    ns.tprint(ns.ls('home', 'scripts/growScript.js'));
}
