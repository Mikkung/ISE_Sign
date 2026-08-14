import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const dataSource = readFileSync(join(process.cwd(), "src/lib/data.ts"), "utf8");

describe("audit history query safety", () => {
  it("uses the actor_id relationship hint for audit log profile embeds", () => {
    expect(dataSource).toContain("actor:profiles!audit_logs_actor_id_fkey");
  });

  it("does not use the ambiguous actor profile embed", () => {
    expect(dataSource).not.toContain("actor:profiles(display_name");
  });
});
