import { NS } from '@ns';
import { Time, Threads } from '/hacking/constants';
import { RamManagementModule } from './ramManagementModule';
import { LoggingUtility } from '/lib/loggingUtils';
import { TargetableServer } from './targetableServer';

export interface QueuedHackCall {
    time: Time;
    fn: () => void;
}

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
    }

    public initialQueue() {
        super.initialQueue();
        this.enqueue({
            time: Date.now(),
            fn: this.refreshTargetable.bind(this),
        });
        this.enqueue({
            time: Date.now(),
            fn: this.decideRamProportioning.bind(this),
        });
        this.enqueue({
            time: Date.now(),
            fn: this.manageMoney.bind(this),
        });
        this.enqueue({
            time: Date.now(),
            fn: this.manageExp.bind(this),
        });
    }

    public manageMoney() {
        this.moneyTargets.forEach(([name, alloc, time]) => {
            if (Date.now() > time + 5_000)
                this.serverTargets[name].queueBatch(
                    'money',
                    this.totalServerRam * alloc,
                );
        });

        this.enqueue({
            time: Math.min(
                Date.now() + 5_000,
                ...this.moneyTargets.map(([name, alloc, time]) => time),
            ),
            fn: this.manageMoney.bind(this),
        });
    }

    public manageExp() {
        this.expTargets.forEach(([name, alloc, time]) => {
            if (Date.now() > time + 5_000)
                this.serverTargets[name].queueBatch(
                    'exp',
                    this.totalServerRam * alloc,
                );
        });

        this.enqueue({
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
                        currentTime: Time,
                        startTime: Time,
                        endTime: Time,
                    ) =>
                        this.fire(
                            script,
                            threads,
                            fracturable,
                            endTime,
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
            time: Date.now() + 300_000,
            fn: this.refreshTargetable.bind(this),
        });
    }

    /** Updates the ram proportioning breakdown */
    public decideRamProportioning(): void {
        const moneyAlloc = 0;
        const expAlloc = 0.5;

        const bestMoneyServerRamAlloc = this.totalServerRam * moneyAlloc;
        const [bestMoneyServer, bestMoneyServerValue] = Object.values(
            this.serverTargets,
        ).reduce(
            (best, serverTar) => {
                const value = serverTar.evaluate(
                    'money',
                    bestMoneyServerRamAlloc,
                );
                if (value > best[1]) return [serverTar.server.hostname, value];
                return best;
            },
            ['home', -1],
        );
        if (bestMoneyServer !== 'home')
            this.moneyTargets = [[bestMoneyServer, moneyAlloc, 0]];
        else this.moneyTargets = [];

        const bestExpServerRamAlloc = this.totalServerRam * expAlloc;
        const [bestExpServer, bestExpServerValue] = Object.values(
            this.serverTargets,
        ).reduce(
            (best, serverTar) => {
                const value = serverTar.evaluate('exp', bestExpServerRamAlloc);
                if (value > best[1]) return [serverTar.server.hostname, value];
                return best;
            },
            ['home', -1],
        );
        if (bestExpServer !== 'home' && bestExpServer !== bestMoneyServer)
            this.expTargets = [[bestExpServer, expAlloc, 0]];
        else this.expTargets = [];
    }

    public log(): Record<string, any> {
        this.enqueue({
            time: Date.now() + 120_000,
            fn: () => this.logger.logToFile(),
        });
        return super.log();
    }
}
