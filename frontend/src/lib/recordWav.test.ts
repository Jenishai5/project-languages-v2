import { encodeWav } from "./recordWav";

test("encodeWav writes a 16 kHz mono PCM header and clamps samples", async () => {
  const blob = encodeWav(new Float32Array([0, 1, -1, 2]));
  const view = new DataView(await blob.arrayBuffer());
  const text = (offset: number) => String.fromCharCode(...[0, 1, 2, 3].map(i => view.getUint8(offset + i)));

  expect(blob.type).toBe("audio/wav");
  expect([text(0), text(8), text(36)]).toEqual(["RIFF", "WAVE", "data"]);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getUint32(24, true)).toBe(16000);
  expect(view.getUint32(40, true)).toBe(8);
  expect([view.getInt16(46, true), view.getInt16(48, true), view.getInt16(50, true)]).toEqual([32767, -32768, 32767]);
});
