import { NS } from '@ns';
import { Time, Threads } from '/hacking/constants';
import { RamManagementModule } from '/hacking/ramManagementModule';
import { LoggingUtility } from '/lib/loggingUtils';
import { TargetableServer } from '/hacking/targetableServer';

export class HackingModule extends RamManagementModule {
    /** Targetable servers */
    protected serverTargets: Record<string, TargetableServer> = {};
    /** Servers for money */
    private moneyTargets: [string, number, Time][] = [];
    /** Servers for exp */
    private expTargets: [string, number, Time][] = [];
    /** Amount of RAM to do sharing with */
    stanekRam: number = 0;

    constructor(protected ns: NS) {
        super(ns);

        this.logger = new LoggingUtility(
            ns,
            'hackingModule',
            this.log.bind(this),
        );

        this.initialQueue();
    }

    protected initialQueue() {
        super.initialQueue();
        this.enqueue({
            name: 'log',
            time: Date.now(),
            fn: this.log.bind(this),
        });
        this.enqueue({
            name: 'refreshTargetable',
            time: Date.now(),
            fn: this.refreshTargetable.bind(this),
        });
        this.enqueue({
            name: 'decideRamProportioning',
            time: Date.now(),
            fn: this.decideRamProportioning.bind(this),
        });
        this.enqueue({
            name: 'manageMoney',
            time: Date.now(),
            fn: this.manageMoney.bind(this),
        });
        this.enqueue({
            name: 'manageExp',
            time: Date.now(),
            fn: this.manageExp.bind(this),
        });
    }

    public manageMoney() {
        //this.ns.tprint(this.moneyTargets);
        for (let i = 0; i < this.moneyTargets.length; i++) {
            let [name, alloc, time] = this.moneyTargets[i];
            if (Date.now() >= time) {
                this.moneyTargets[i][2] = this.serverTargets[name].startBatch(
                    'money',
                    this.totalServerRam * alloc,
                );
                this.kick = true;
            }
        }
        //this.ns.tprint(this.moneyTargets.map(([name, alloc, time]) => time));

        this.enqueue({
            name: 'manageMoney',
            time: Math.min(
                Date.now() + 5_000,
                ...this.moneyTargets.map(([name, alloc, time]) => time),
            ),
            fn: this.manageMoney.bind(this),
        });
    }

    public manageExp() {
        //this.ns.tprint(Date.now());
        //this.ns.tprint(this.expTargets);
        for (let i = 0; i < this.expTargets.length; i++) {
            let [name, alloc, time] = this.expTargets[i];
            if (Date.now() >= time) {
                this.expTargets[i][2] = this.serverTargets[name].startBatch(
                    'exp',
                    this.totalServerRam * alloc,
                );
                this.kick = true;
            }
        }
        //this.ns.tprint(this.expTargets.map(([name, alloc, time]) => time));

        this.enqueue({
            name: 'manageExp',
            time: Math.min(
                Date.now() + 5_000,
                ...this.expTargets.map(([name, alloc, time]) => time),
            ),
            fn: this.manageExp.bind(this),
        });
    }

    private makeTargetables() {
        for (let server of this.targetableServers) {
            if (!this.serverTargets[server.hostname]) {
                this.serverTargets[server.hostname] = new TargetableServer(
                    this.ns,
                    server.hostname,
                    this.enqueue.bind(this),
                    (
                        script: string,
                        threads: Threads,
                        fracturable: boolean,
                        target: string,
                        currentTime: Time,
                        startTime: Time,
                        endTime: Time,
                    ) =>
                        this.fire(
                            script,
                            threads,
                            fracturable,
                            endTime,
                            target,
                            currentTime,
                            startTime,
                            endTime,
                        ),
                    this.kill.bind(this),
                );
            }
        }
    }

    public refreshTargetable(): void {
        super.refreshTargetable();
        this.makeTargetables();
        this.enqueue({
            name: 'refreshTargetable',
            time: Date.now() + 300_000,
            fn: this.refreshTargetable.bind(this),
        });
    }

    /** Updates the ram proportioning breakdown */
    public decideRamProportioning(): void {
        const early =
            Date.now() - this.ns.getResetInfo().lastAugReset < 600_000;
        const moneyAlloc = early ? 0 : 0.5;
        const moneyServers = 1;
        const expAlloc = early ? 0.6 : 0.05;

        this.ns.tprint(this.totalServerRam);

        const bestMoneyServerRamAlloc =
            (this.totalServerRam * moneyAlloc) / moneyServers;
        const serverValues: [string, number][] = Object.values(
            this.serverTargets,
        ).map((serverTar) => {
            const value = serverTar.evaluate('money', bestMoneyServerRamAlloc);
            return [serverTar.server.hostname, value];
        });
        serverValues.sort((a, b) => b[1] - a[1]);
        this.ns.tprint(serverValues);

        this.moneyTargets = serverValues
            .slice(0, moneyServers)
            .map((sval) => [sval[0], moneyAlloc / moneyServers, 0]);

        const moneyBlockExp = this.moneyTargets.map((tar) => tar[0]);

        //const [bestMoneyServer, bestMoneyServerValue] =
        //if (bestMoneyServer !== 'home' && bestMoneyServerValue !== 0)
        //this.moneyTargets = [['megacorp', moneyAlloc, 0]]; //test
        //else this.moneyTargets = [];

        const bestExpServerRamAlloc = this.totalServerRam * expAlloc;
        const [bestExpServer, bestExpServerValue] = Object.values(
            this.serverTargets,
        ).reduce(
            (best, serverTar) => {
                if (moneyBlockExp.includes(serverTar.server.hostname))
                    return best;
                const value = serverTar.evaluate('exp', bestExpServerRamAlloc);
                if (value > best[1]) return [serverTar.server.hostname, value];
                return best;
            },
            ['home', -1],
        );
        if (bestExpServer !== 'home' && bestExpServerValue !== 0)
            this.expTargets = [[bestExpServer, expAlloc, 0]];
        else this.expTargets = [];

        this.ns.tprint(this.moneyTargets);
        this.ns.tprint(this.expTargets);

        this.enqueue({
            name: 'decideRamProportioning',
            time: Date.now() + 600_000,
            fn: this.decideRamProportioning.bind(this),
        });
    }

    public log(): Record<string, any> {
        this.enqueue({
            name: 'logger.logToFile',
            time: Date.now() + 120_000,
            fn: () => this.logger.logToFile(),
        });
        return super.log();
    }
}
