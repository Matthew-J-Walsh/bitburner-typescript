/** Target power */
export const targetGangWinPower = 1e3 / 12;

export const gangMemberStatList = ['hack', 'str', 'def', 'dex', 'agi', 'cha'];
export const gangMemberExpList = [
    'hack_exp',
    'str_exp',
    'def_exp',
    'dex_exp',
    'agi_exp',
    'cha_exp',
];

export function randomString(length: number): string {
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
