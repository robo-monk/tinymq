export const Fuzz = {
    number(min: number, max: number) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    string(length: number) {
        return Array.from({ length }, () => Math.random().toString(36)[2]).join('');
    }
}
