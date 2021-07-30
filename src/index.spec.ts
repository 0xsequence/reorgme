import { hello } from '.';

describe('index', () => {
    describe('test', () => {
        it('should return 42', () => {
            const result = hello();

            expect(result).toEqual(42);
        });
    });
});
