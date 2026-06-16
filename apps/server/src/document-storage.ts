import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export type StoredDocumentObject = {
  body: ArrayBuffer;
  contentType: string;
  byteSize: number;
};

export type DocumentObjectStorage = {
  put(input: { objectKey: string; body: ArrayBuffer; contentType: string }): Promise<void>;
  get(objectKey: string): Promise<StoredDocumentObject | null>;
  delete(objectKey: string): Promise<void>;
};

type FileDocumentObjectMetadata = {
  contentType: string;
  byteSize: number;
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
    async delete(objectKey) {
      await bucket.delete(objectKey);
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
    async delete(objectKey) {
      objects.delete(objectKey);
    },
  };
}

export function createFileDocumentObjectStorage(rootDirectory: string): DocumentObjectStorage {
  const root = resolve(rootDirectory);

  return {
    async put(input) {
      const objectPath = fileObjectPath(root, input.objectKey);
      const metadataPath = fileMetadataPath(root, input.objectKey);
      const body = Buffer.from(input.body);
      const metadata: FileDocumentObjectMetadata = {
        contentType: input.contentType,
        byteSize: body.byteLength,
      };

      await mkdir(dirname(objectPath), { recursive: true });
      await writeFile(objectPath, body);
      await writeFile(metadataPath, JSON.stringify(metadata), "utf8");
    },
    async get(objectKey) {
      const objectPath = fileObjectPath(root, objectKey);
      const metadataPath = fileMetadataPath(root, objectKey);

      try {
        const [body, metadata] = await Promise.all([
          readFile(objectPath),
          readFile(metadataPath, "utf8")
            .then((value) => parseFileMetadata(value))
            .catch(() => null),
        ]);

        return {
          body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
          contentType: metadata?.contentType ?? "application/octet-stream",
          byteSize: metadata?.byteSize ?? body.byteLength,
        };
      } catch (error) {
        if (isNotFoundError(error)) {
          return null;
        }

        throw error;
      }
    },
    async delete(objectKey) {
      await Promise.all([
        rm(fileObjectPath(root, objectKey), { force: true }),
        rm(fileMetadataPath(root, objectKey), { force: true }),
      ]);
    },
  };
}

function fileObjectPath(root: string, objectKey: string) {
  const resolved = resolve(root, objectKey);

  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) {
    throw new Error("Document object key escapes local storage root");
  }

  return resolved;
}

function fileMetadataPath(root: string, objectKey: string) {
  return `${fileObjectPath(root, objectKey)}.metadata.json`;
}

function parseFileMetadata(value: string): FileDocumentObjectMetadata | null {
  try {
    const parsed = JSON.parse(value);

    return {
      contentType:
        typeof parsed.contentType === "string" ? parsed.contentType : "application/octet-stream",
      byteSize:
        typeof parsed.byteSize === "number" && Number.isFinite(parsed.byteSize)
          ? parsed.byteSize
          : 0,
    };
  } catch {
    return null;
  }
}

function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
