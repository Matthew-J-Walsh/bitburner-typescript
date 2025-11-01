import { NS } from '@ns';

function decorator() {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ) {
        const fn = descriptor.value;
        descriptor.value = function (...args: []) {
            fn.apply(this, args);
            fn.apply(this, args);
        };
        return descriptor;
    };
}

export async function main(ns: NS): Promise<void> {
    ns.tprint('Hello Remote API!');
    const tc = new TestClass();
    tc.printstuff(ns);
}

class TestClass {
    @decorator()
    printstuff(ns: NS): void {
        ns.tprint('Test Class');
    }
}
