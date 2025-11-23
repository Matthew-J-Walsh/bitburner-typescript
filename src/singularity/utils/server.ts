import { NS } from '@ns';
import { Action } from '../constants';
import { DefaultFunctions } from './defaults';

export class ServerFunctions extends DefaultFunctions {
    public static backdoorServer(ns: NS, hostname: string): Action {
        return async () => {
            const target = ns.getServer(hostname);
            if (target.hasAdminRights) {
                ServerFunctions.connectToServer(ns, hostname);
                await ns.singularity.installBackdoor();
                ServerFunctions.connectToServer(ns, 'home');
            } else throw new Error(`No access to ${hostname}`);
        };
    }

    public static W0r1dDe43m0n(ns: NS, nextBN: number): Action {
        return async () => {
            const target = ns.getServer('w0r1d_d43m0n');
            if (target.hasAdminRights) {
                ServerFunctions.connectToServer(ns, 'w0r1d_d43m0n');
                await ns.singularity.destroyW0r1dD43m0n(nextBN);
            } else throw new Error(`No access to ${'w0r1d_d43m0n'}`);
        };
    }

    private static connectToServer(ns: NS, hostname: string) {
        const path = ServerFunctions.findPath(ns, hostname);
        if (!path) return;

        ns.singularity.connect('home');
        for (let i = 1; i < path.length; i++) {
            ns.singularity.connect(path[i]);
        }
    }

    private static findPath(
        ns: NS,
        target: string,
        current = 'home',
        visited = new Set(),
    ): string[] | null {
        if (current === target) return [current];

        visited.add(current);
        const neighbors = ns.scan(current);

        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                const path = ServerFunctions.findPath(
                    ns,
                    target,
                    neighbor,
                    visited,
                );
                if (path) return [current, ...path];
            }
        }

        return null;
    }
}
