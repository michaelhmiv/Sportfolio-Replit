import { Link } from "wouter";

interface UserNameProps {
  userId: string;
  username: string;
  className?: string;
}

export function UserName({ userId, username, className = "" }: UserNameProps) {
  return (
    <Link href={`/user/${userId}`}>
      <button
        className={`hover:underline hover:text-primary cursor-pointer transition-colors ${className}`}
        data-testid={`link-user-${userId}`}
      >
        @{username}
      </button>
    </Link>
  );
}
