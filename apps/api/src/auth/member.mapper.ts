import type { Role, TeamMember } from "@nv/domain";

import type { UserRecord } from "./auth.types";

const PALETTE = ["#5B8DEF", "#7C7CF0", "#3FB950", "#E3B341", "#F85149", "#229ED9"];

function colorFor(id: string): string {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return PALETTE[sum % PALETTE.length]!;
}

/** Maps a stored user + role to the shared TeamMember shape. */
export function toTeamMember(user: UserRecord, role: Role): TeamMember {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    online: false,
    avatarColor: colorFor(user.id),
  };
}
