import { NS } from '@ns';

//needed cause we cannot double spawn ;.; and spawn costs fucking GBs like wtf

export async function main(ns: NS) {
    const script = 'stanek/jumpstart.js';
    ns.spawn(
        script,
        Math.floor(ns.getServerMaxRam(script) / ns.getScriptRam(script)),
        ...ns.args,
    );
}
