export type StoredDocumentObject = {
  body: ArrayBuffer;
  contentType: string;
  byteSize: number;
};

export type DocumentObjectStorage = {
  put(input: { objectKey: string; body: ArrayBuffer; contentType: string }): Promise<void>;
  get(objectKey: string): Promise<StoredDocumentObject | null>;
};

export function createR2DocumentObjectStorage(bucket: R2Bucket): DocumentObjectStorage {
  return {
    async put(input) {
      await bucket.put(input.objectKey, input.body, {
        httpMetadata: {
          contentType: input.contentType,
        },
      });
    },
    async get(objectKey) {
      const object = await bucket.get(objectKey);

      if (!object) {
        return null;
      }

      return {
        body: await object.arrayBuffer(),
        contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
        byteSize: object.size,
      };
    },
  };
}

export function createMemoryDocumentObjectStorage(): DocumentObjectStorage & {
  objects: Map<string, StoredDocumentObject>;
} {
  const objects = new Map<string, StoredDocumentObject>();

  return {
    objects,
    async put(input) {
      objects.set(input.objectKey, {
        body: input.body,
        contentType: input.contentType,
        byteSize: input.body.byteLength,
      });
    },
    async get(objectKey) {
      return objects.get(objectKey) ?? null;
    },
  };
}
