import { createContext, useContext, useState, type ReactNode } from "react";

interface VestingContextType {
  openRedemptionModal: (preselectedPlayerIds?: string[]) => void;
  redemptionModalOpen: boolean;
  setRedemptionModalOpen: (open: boolean) => void;
  preselectedPlayerIds: string[];
}

const VestingContext = createContext<VestingContextType | null>(null);

export function VestingProvider({ children }: { children: ReactNode }) {
  const [redemptionModalOpen, setRedemptionModalOpen] = useState(false);
  const [preselectedPlayerIds, setPreselectedPlayerIds] = useState<string[]>([]);

  const openRedemptionModal = (playerIds?: string[]) => {
    setPreselectedPlayerIds(playerIds || []);
    setRedemptionModalOpen(true);
  };

  return (
    <VestingContext.Provider 
      value={{ 
        openRedemptionModal, 
        redemptionModalOpen, 
        setRedemptionModalOpen, 
        preselectedPlayerIds 
      }}
    >
      {children}
    </VestingContext.Provider>
  );
}

export function useVesting() {
  const context = useContext(VestingContext);
  if (!context) {
    throw new Error("useVesting must be used within a VestingProvider");
  }
  return context;
}
