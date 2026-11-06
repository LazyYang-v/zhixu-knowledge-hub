import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { AppError } from "../http/errors.js";
const parameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let active = 0;
function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (active >= 2)
    return Promise.reject(
      new AppError(429, "PASSWORD_SERVICE_BUSY", "身份服务繁忙，请稍后重试"),
    );
  active++;
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 32, parameters, (error, key) => {
      active--;
      error ? reject(error) : resolve(key);
    }),
  );
}
export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128)
    throw new Error("PASSWORD_LENGTH_INVALID");
  const salt = randomBytes(16);
  return `scrypt$131072$8$1$${salt.toString("hex")}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded?: string) {
  const valid = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(
    encoded ?? "",
  );
  const key = await derive(
    password,
    Buffer.from(valid?.[1] ?? "0".repeat(32), "hex"),
  );
  return !!valid && timingSafeEqual(key, Buffer.from(valid[2], "hex"));
}
