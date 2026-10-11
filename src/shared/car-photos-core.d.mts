export interface ModelPhoto { src: string; page: string; author: string; license: string; interior: boolean }
export declare const COMMONS_API: string;
export declare const CAR_PHOTO_QUERIES: Record<string, string[]>;
export declare function pickPhotos(json: unknown): ModelPhoto[];
export declare function commonsSearchUrl(q: string, opts?: { cors?: boolean }): URL;
