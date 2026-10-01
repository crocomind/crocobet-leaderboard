import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Employee } from "@/lib/api/types";
import { cn, initials } from "@/lib/utils";

const sizes = {
  sm: "size-9 text-xs",
  md: "size-11 text-sm",
  lg: "size-14 text-base",
  xl: "size-20 text-xl",
} as const;

const AVATAR_TOKENS = 6;

function hash(value: string): number {
  let result = 0;
  for (let i = 0; i < value.length; i++)
    result = (result * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(result);
}

interface EmployeeAvatarProps {
  employee: Pick<Employee, "id" | "name" | "avatarUrl">;
  size?: keyof typeof sizes;
  className?: string;
}

export function EmployeeAvatar({
  employee,
  size = "md",
  className,
}: EmployeeAvatarProps) {
  const background = `var(--avatar-${(hash(employee.id) % AVATAR_TOKENS) + 1})`;
  return (
    <Avatar className={cn(sizes[size], className)}>
      {employee.avatarUrl && <AvatarImage src={employee.avatarUrl} alt="" />}
      <AvatarFallback style={{ background }} aria-hidden="true">
        {initials(employee.name)}
      </AvatarFallback>
    </Avatar>
  );
}
