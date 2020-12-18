import assert from 'assert';
import { TLV } from './types';
import { MultiMap } from './MultiMap';

/**
 * @see http://iserverd1.khstu.ru/oscar/basic.html#b0003
 */
export function parseTLVs(data: Buffer) {
    const tlvs = new MultiMap<number, TLV>();

    for (let cursor = 0; cursor < data.byteLength /* */; ) {
        const type = data.readUInt16BE(cursor);

        const lengthStart = cursor + 2;
        const length = data.readUInt16BE(lengthStart);

        const valueStart = lengthStart + 2;
        const valueEnd = valueStart + length;
        // A TLV's value can be 0 bytes. Odd that they're
        // not just excluded from the request, but ¯\_(ツ)_/¯
        const value = length
            ? data.subarray(valueStart, valueEnd)
            : // Empty buffer so we don't have to explicitly handle
              // a null/undefined anywhere a TLV type propagates
              Buffer.alloc(0);

        tlvs.set(type, { type, length, value });

        cursor = valueEnd;
        assert(cursor <= data.byteLength, 'Overflow that should never happen');
    }

    return tlvs;
}