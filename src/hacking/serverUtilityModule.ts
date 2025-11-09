import { NS, Server } from '@ns';
import { BackgroundTask, PriorityTask } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';
import { Heap } from '/lib/heap';
import { purchasedServerPrefix, scriptMapping } from '/hacking/constants';

type PurchasedServer = {
    hostname: string;
    totalRam: number;
};

export class ServerUtilityModule extends BaseModule {
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
        (a, b) => b.totalRam - a.totalRam,
    );
    /** List of crackers */
    private crackers: { file: string; fn: (host: string) => boolean }[] = [];
    /** List of hooks for server updates */
    private serverUpdateHooks: Array<(server: Server) => void> = [];

    public init(ns: NS) {
        super.init(ns);
        this.fullServerScan();
        this.crackers = [
            { file: 'BruteSSH.exe', fn: this.ns.brutessh },
            { file: 'FTPCrack.exe', fn: this.ns.ftpcrack },
            { file: 'relaySMTP.exe', fn: this.ns.relaysmtp },
            { file: 'HTTPWorm.exe', fn: this.ns.httpworm },
            { file: 'SQLInject.exe', fn: this.ns.sqlinject },
        ];
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
            if (server.hasAdminRights === false) {
                this.futureRootableServers.push(server);
            } else {
                this.ourServers.set(servername, server);
                this.ourHostnames.push(servername);
            }
            if (server.hackDifficulty != null && server.hackDifficulty! > 0) {
                if (server.hasAdminRights) {
                    this.targetableServers.push(server);
                } else {
                    this.futureTargetableServers.push(server);
                }
            }
            if (server.purchasedByPlayer) {
                this.purchasedServers.push({
                    hostname: servername,
                    totalRam: server.maxRam,
                });
            }
        }
    }

    /** Tries to root more servers */
    @BackgroundTask(300_000)
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
    }

    /** Refreshes targetable server list */
    @BackgroundTask(300_000)
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
    public purchaseServer(): void {
        if (this.purchasedServers.size >= this.ns.getPurchasedServerLimit()) {
            const hostname = this.ns.purchaseServer(
                purchasedServerPrefix + `${this.purchasedServers.size}`,
                2,
            );
            if (hostname === '') {
                this.ns.tprint('purchaseServer() assertion failure');
            } else {
                this.servers.set(hostname, this.serverUpdate(hostname));
                this.ourServers.set(hostname, this.serverUpdate(hostname));
            }
        } else {
            const upgradeServer = this.purchasedServers.pop()!;
            const success = this.ns.upgradePurchasedServer(
                upgradeServer.hostname,
                upgradeServer.totalRam * 2,
            );
            if (!success) {
                this.ns.tprint('purchaseServer() assertion failure');
                this.purchasedServers.push({
                    hostname: upgradeServer.hostname,
                    totalRam: upgradeServer.totalRam,
                });
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
        }
    }

    /**
     * Gets the least expensive ram
     * @returns [ram gained, cost]
     */
    public cheapestPurchasableServer(): [number, number] {
        const smallestRam = this.purchasedServers.peek()?.totalRam ?? 0;
        const nextRam = smallestRam === 0 ? 2 : smallestRam * 2;
        if (nextRam > this.ns.getPurchasedServerMaxRam()) {
            return [0, 0];
        }
        const cost =
            nextRam === 2
                ? this.ns.getPurchasedServerCost(2)
                : this.ns.getPurchasedServerUpgradeCost(
                      this.purchasedServers.peek()!.hostname,
                      nextRam,
                  );
        return [nextRam === 2 ? 2 : nextRam / 2, cost];
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
            ) - this.ns.ramOverride()
        );
    }

    /**
     * Places scripts on a server to be run later
     * @param server Server
     */
    public placeScriptsOnServer(server: Server) {
        const scripts = [
            '/scripts/hackScript.js',
            '/scripts/growScript.js',
            '/scripts/weakenScript.js',
            '/scripts/shareScript.js',
            '/scripts/stanekScript.js',
        ];
        scripts.forEach((script) => {
            if (!this.ns.fileExists(script, server.hostname)) {
                this.ns.scp(script, server.hostname);
            }
        });
    }

    public serverUpdateHook(fn: (server: Server) => void) {
        this.serverUpdateHooks.push(fn);
    }

    private serverUpdate(hostname: string): Server {
        const server = this.ns.getServer(hostname);
        this.serverUpdateHooks.forEach((hook) => hook(server));
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

/**
 * ### ServerUtilityModule Uniqueness
 * This modules handles server structural management. It roots servers and purchases servers.
 * It provides access to lists of servers that are possible hacking targets.
 * It provides aceces to lists of servers that can have their RAM utilized.
 */
export const serverUtilityModule = new ServerUtilityModule();
state.push(serverUtilityModule);
