import { NS, Server } from '@ns';
import { Heap } from '/lib/heap';
import { purchasedServerPrefix, scriptMapping } from '/hacking/constants';
import { LoggingUtility } from '/lib/loggingUtils';
import { QueueManagementModule } from './queueManagementModule';

type PurchasedServer = {
    hostname: string;
    totalRam: number;
};

/**
 * ### ServerUtilityModule Uniqueness
 * This modules handles server structural management. It roots servers and purchases servers.
 * It provides access to lists of servers that are possible hacking targets.
 * It provides aceces to lists of servers that can have their RAM utilized.
 */
export class ServerUtilityModule extends QueueManagementModule {
    /** Full map of servers */
    public servers: Map<string, Server> = new Map<string, Server>();
    /** Map of servers that we have admin of */
    public ourServers: Map<string, Server> = new Map<string, Server>();
    /** Cannonical ordered hostnames */
    public ourHostnames: Array<string> = [];
    /** Array of servers that are not yet rooted */
    private futureRootableServers: Array<Server> = [];
    /** Array of servers that can be hacked for money or exp */
    public targetableServers: Array<Server> = [];
    /** Array of servers that can't be hacekd yet but might be hackable */
    private futureTargetableServers: Array<Server> = [];
    /** Heap of purchased servers by RAM size */
    private purchasedServers: Heap<PurchasedServer> = new Heap<PurchasedServer>(
        (a, b) => a.totalRam - b.totalRam,
    );
    /** List of crackers */
    private crackers!: { file: string; fn: (host: string) => boolean }[];
    /** Reserved ram */
    private reservedRam!: number;
    /** Logger */
    public logger!: LoggingUtility;

    constructor(protected ns: NS) {
        super();
        this.crackers = [
            { file: 'BruteSSH.exe', fn: this.ns.brutessh.bind(this.ns) },
            { file: 'FTPCrack.exe', fn: this.ns.ftpcrack.bind(this.ns) },
            { file: 'relaySMTP.exe', fn: this.ns.relaysmtp.bind(this.ns) },
            { file: 'HTTPWorm.exe', fn: this.ns.httpworm.bind(this.ns) },
            { file: 'SQLInject.exe', fn: this.ns.sqlinject.bind(this.ns) },
        ];
        this.fullServerScan();
    }

    public initialQueue(): void {
        super.initialQueue();
        this.enqueue({
            time: Date.now() + 300_000,
            fn: this.rootServers.bind(this),
        });
    }

    /** Scans all servers, refreshing the server record */
    fullServerScan(): void {
        this.servers = new Map<string, Server>();
        this.ourServers = new Map<string, Server>();
        this.ourHostnames = [];
        this.futureRootableServers = [];
        this.targetableServers = [];
        this.futureTargetableServers = [];
        const seen = new Set<string>();
        const queue: string[] = ['home'];
        seen.add('home');

        while (queue.length > 0) {
            const servername: string = queue.pop()!;
            const server = this.serverUpdate(servername);
            this.servers.set(servername, server);
            this.ns.scan(servername).forEach((neighbor) => {
                if (!seen.has(neighbor)) {
                    seen.add(neighbor);
                    queue.push(neighbor);
                }
            });
            this.ns.killall(server.hostname, true);
            if (server.hasAdminRights === false) {
                this.futureRootableServers.push(server);
            } else {
                this.ourServers.set(servername, server);
                this.ourHostnames.push(servername);
            }
            if (
                server.hackDifficulty != null &&
                server.hackDifficulty! > 0 &&
                server.purchasedByPlayer != true &&
                server.hostname != 'darkweb'
            ) {
                if (server.hasAdminRights) {
                    this.targetableServers.push(server);
                } else {
                    this.futureTargetableServers.push(server);
                }
            }
            if (server.purchasedByPlayer && server.hostname != 'home') {
                this.purchasedServers.push({
                    hostname: servername,
                    totalRam: server.maxRam,
                });
            }
        }
    }

    /** Tries to root more servers */
    rootServers(): void {
        const crackers = this.crackers.filter((cracker) =>
            this.ns.fileExists(cracker.file, 'home'),
        );

        this.futureRootableServers = this.futureRootableServers.filter(
            (server) => {
                if (server.numOpenPortsRequired! <= crackers.length) {
                    crackers.forEach((cracker) => cracker.fn(server.hostname));
                    if (this.ns.nuke(server.hostname)) {
                        this.ourServers.set(server.hostname, server);
                        this.ourHostnames.push(server.hostname);
                        return false;
                    } else {
                        this.ns.tprint(
                            `rootServers() assertion failure for ${server.hostname}`,
                        );
                    }
                }
                return true;
            },
        );

        this.enqueue({
            time: Date.now() + 300_000,
            fn: this.rootServers.bind(this),
        });
    }

    /** Refreshes targetable server list */
    refreshTargetable(): void {
        const currentHackingLevel = this.ns.getHackingLevel();

        this.futureTargetableServers = this.futureTargetableServers.filter(
            (server) => {
                if (
                    server.requiredHackingSkill! <= currentHackingLevel &&
                    server.hasAdminRights
                ) {
                    this.targetableServers.push(server);
                    return false;
                } else {
                    return true;
                }
            },
        );
    }

    /** Buys the least expensive RAM */
    public purchaseServer(): boolean {
        if (this.purchasedServers.size < this.ns.getPurchasedServerLimit()) {
            const hostname = this.ns.purchaseServer(purchasedServerPrefix, 256);
            if (hostname === '') {
                this.ns.tprint('purchaseServer() assertion failure A');
                return false;
            } else {
                this.servers.set(hostname, this.serverUpdate(hostname));
                this.ourServers.set(hostname, this.serverUpdate(hostname));
                return true;
            }
        } else {
            const upgradeServer = this.purchasedServers.pop()!;
            const success = this.ns.upgradePurchasedServer(
                upgradeServer.hostname,
                upgradeServer.totalRam * 2,
            );
            if (!success) {
                this.ns.tprint('purchaseServer() assertion failure B');
                this.purchasedServers.push({
                    hostname: upgradeServer.hostname,
                    totalRam: upgradeServer.totalRam,
                });
                return false;
            } else {
                this.purchasedServers.push({
                    hostname: upgradeServer.hostname,
                    totalRam: upgradeServer.totalRam * 2,
                });
            }
            this.servers.set(
                upgradeServer.hostname,
                this.serverUpdate(upgradeServer.hostname),
            ); //TODO: Is this needed?
            this.ourServers.set(
                upgradeServer.hostname,
                this.serverUpdate(upgradeServer.hostname),
            ); //TODO: Is this needed?
            return true;
        }
    }

    /**
     * Gets the least expensive ram
     * @returns [ram gained, cost]
     */
    public cheapestPurchasableServer(): [number, number] {
        if (this.purchasedServers.size < this.ns.getPurchasedServerLimit()) {
            return [256, this.ns.getPurchasedServerCost(256)];
        } else {
            const nextUpgrade = this.purchasedServers.peek()!;
            const nextRam = nextUpgrade.totalRam * 2;
            if (nextRam > this.ns.getPurchasedServerMaxRam()) {
                return [0, 0];
            }
            return [
                nextRam,
                this.ns.getPurchasedServerUpgradeCost(
                    nextUpgrade.hostname,
                    nextRam,
                ),
            ];
        }
    }

    /** Upgrades the home ram */
    public upgradeHomeRam(): void {}

    /** Upgrades the home cores */
    public upgradeHomeCores(): void {}

    /** Total available RAM
     * TODO: Speed me up
     */
    get totalServerRam(): number {
        return (
            Array.from(this.ourServers.values()).reduce(
                (acc, server) => acc + server.maxRam,
                0,
            ) - this.reservedRam
        );
    }

    //get maximumServerRam()

    /**
     * Updates a server information
     * @param hostname
     * @returns
     */
    private serverUpdate(hostname: string): Server {
        const server = this.ns.getServer(hostname);
        // We set this as we don't depend on hackDifficulty ever anyway
        server.hackDifficulty = server.minDifficulty;
        return server;
    }

    public log(): Record<string, any> {
        return {
            totalRam: this.totalServerRam,
            serversLength: this.servers.size,
            ourServersLength: this.ourServers.size,
            ourHostnamesLength: this.ourHostnames.length,
            futureRootableServersLength: this.futureRootableServers.length,
            targetableServersLength: this.targetableServers.length,
            futureTargetableServersLength: this.futureTargetableServers.length,
            purchasedServersLength: this.purchasedServers.size,
        };
    }
}
