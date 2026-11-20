import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { generarContrastePar, validarDimensionesContraste } from "../../tests/e2e/helpers/contraste";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function crearPngSolido(width: number, height: number, rgba: [number, number, number, number]): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = 1 + width * 4;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter None
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 4;
      raw[px] = rgba[0];
      raw[px + 1] = rgba[1];
      raw[px + 2] = rgba[2];
      raw[px + 3] = rgba[3];
    }
  }

  const idat = deflateSync(raw);
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

describe("Athlete v7 · R1: Validación de dimensiones en contraste visual", () => {
  it("lanza Error cuando app mide 1024×2216 y ref mide 390×844, indicando clave, tema y dimensiones", () => {
    expect(() =>
      validarDimensionesContraste(390, 844, 1024, 2216, { clave: "inicio", tema: "light" }),
    ).toThrowError(/Dimensiones incompatibles.*inicio · light.*ref=390×844.*app=1024×2216/);
  });

  it("lanza Error cuando difiere solo el ancho o solo el alto", () => {
    expect(() => validarDimensionesContraste(390, 844, 400, 844)).toThrowError(/ref=390×844, app=400×844/);
    expect(() => validarDimensionesContraste(390, 844, 390, 900)).toThrowError(/ref=390×844, app=390×900/);
  });

  it("pasa sin error cuando ref y app miden exactamente 390×844", () => {
    expect(() =>
      validarDimensionesContraste(390, 844, 390, 844, { clave: "inicio", tema: "dark" }),
    ).not.toThrow();
  });

  it("generarContrastePar rechaza si ref y app tienen distinto tamaño y resuelve si coinciden", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "gozster-contraste-"));
    const refPath = join(workDir, "ref-390x844.png");
    const appMalaPath = join(workDir, "app-1024x2216.png");
    const appBuenaPath = join(workDir, "app-390x844.png");
    const outPath = join(workDir, "out.png");

    writeFileSync(refPath, crearPngSolido(390, 844, [250, 250, 250, 255]));
    writeFileSync(appMalaPath, crearPngSolido(1024, 2216, [250, 250, 250, 255]));
    writeFileSync(appBuenaPath, crearPngSolido(390, 844, [250, 250, 250, 255]));

    const hasChromium = existsSync(chromium.executablePath());

    try {
      if (hasChromium) {
        const browser = await chromium.launch();
        try {
          await expect(
            generarContrastePar(browser, {
              clave: "inicio",
              tema: "dark",
              refPngPath: refPath,
              appPngPath: appMalaPath,
              outPngPath: outPath,
            }),
          ).rejects.toThrowError(/Dimensiones incompatibles.*inicio · dark.*ref=390×844.*app=1024×2216/);

          const res = await generarContrastePar(browser, {
            clave: "inicio",
            tema: "light",
            refPngPath: refPath,
            appPngPath: appBuenaPath,
            outPngPath: outPath,
          });
          expect(res.pctDistinto).toBe(0);
          expect(existsSync(outPath)).toBe(true);
        } finally {
          await browser.close();
        }
      } else {
        // Entornos sin binario de Chromium (p. ej. CI unitario): verificar que el HTML generado inyecta la validación.
        let capturedHtml = "";
        const fakePage = {
          setContent: async (html: string) => {
            capturedHtml = html;
          },
          evaluate: async (_fn: unknown, args: { clave: string; tema: string }) => {
            expect(capturedHtml).toContain("validarDimensionesContraste(");
            validarDimensionesContraste(390, 844, 1024, 2216, { clave: args.clave, tema: args.tema });
            return 0;
          },
        };
        await expect(
          generarContrastePar(fakePage as never, {
            clave: "inicio",
            tema: "dark",
            refPngPath: refPath,
            appPngPath: appMalaPath,
            outPngPath: outPath,
          }),
        ).rejects.toThrowError(/Dimensiones incompatibles.*inicio · dark.*ref=390×844.*app=1024×2216/);
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
