import { useState } from "react";
import { PlayerModal } from "./player-modal";

interface PlayerNameProps {
  playerId: string;
  firstName: string;
  lastName: string;
  className?: string;
}

export function PlayerName({ playerId, firstName, lastName, className = "" }: PlayerNameProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        className={`hover:underline hover:text-primary cursor-pointer transition-colors ${className}`}
        data-testid={`link-player-${playerId}`}
      >
        {firstName} {lastName}
      </button>
      <PlayerModal playerId={playerId} open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
