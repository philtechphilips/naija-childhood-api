import data from "./photos.generated.json";

export type PhotoName = keyof typeof data;

export interface PhotoInfo {
  width: number;
  height: number;
  widths: number[];
  blur: string;
}

export const photos = data as Record<PhotoName, PhotoInfo>;

export function photoSrc(name: PhotoName, width: number): string {
  const { widths } = photos[name];
  const pick = widths.find((w) => w >= width) ?? widths[widths.length - 1];
  return `/images/${name}-${pick}.webp`;
}

export function photoSrcSet(name: PhotoName): string {
  return photos[name].widths.map((w) => `/images/${name}-${w}.webp ${w}w`).join(", ");
}

export interface AssetCredit {
  what: string;
  source: string;
  author: string;
  license: string;
  licenseUrl: string;
  url: string;
}

/** Third-party 3D assets used in the games and the key art rendered from them. */
export const ASSET_CREDITS: AssetCredit[] = [
  {
    what: "Characters and motion-captured animations",
    source: "Microsoft Rocketbox Avatar Library",
    author: "Microsoft",
    license: "MIT",
    licenseUrl: "https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE",
    url: "https://github.com/microsoft/Microsoft-Rocketbox",
  },
  {
    what: "Scanned surfaces (laterite, road, plaster, zinc) and props (generators, jerrycans, crates, plastic chairs, gates)",
    source: "Poly Haven",
    author: "Poly Haven contributors",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://polyhaven.com",
  },
];
