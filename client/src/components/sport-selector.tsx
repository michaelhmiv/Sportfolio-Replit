/**
 * Sport Selector Component
 * 
 * Dropdown selector for switching between sports (NBA, NFL, etc.)
 * Uses the global sport context for state management.
 */

import { useSport, SPORTS, type Sport } from "@/lib/sport-context";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface SportConfig {
    name: string;
    icon: string;
    disabled?: boolean;
}

const SPORT_DISPLAY: Record<Sport, SportConfig> = {
    NBA: {
        name: "NBA",
        icon: "🏀",
    },
    NFL: {
        name: "NFL",
        icon: "🏈",
    },
    ALL: {
        name: "All Sports",
        icon: "🌎",
    },
};

interface SportSelectorProps {
    /** Additional CSS classes */
    className?: string;
    /** Show as buttons instead of dropdown */
    variant?: "dropdown" | "buttons";
    /** Size of the selector */
    size?: "sm" | "default";
}

/**
 * Sport selector dropdown or button group
 */
export function SportSelector({
    className = "",
    variant = "dropdown",
    size = "default",
}: SportSelectorProps) {
    const { sport, setSport } = useSport();

    if (variant === "buttons") {
        return (
            <div className={`flex gap-1 ${className}`}>
                {SPORTS.map((s) => {
                    const config = SPORT_DISPLAY[s];
                    const isActive = sport === s;

                    return (
                        <Button
                            key={s}
                            variant={isActive ? "default" : "outline"}
                            size={size === "sm" ? "sm" : "default"}
                            onClick={() => setSport(s)}
                            className={`min-w-[60px] ${isActive ? "" : "text-muted-foreground"}`}
                            data-testid={`sport-button-${s.toLowerCase()}`}
                        >
                            <span className="mr-1">{config.icon}</span>
                            {config.name}
                        </Button>
                    );
                })}
            </div>
        );
    }

    // Dropdown variant
    return (
        <Select value={sport} onValueChange={(value) => setSport(value as Sport)}>
            <SelectTrigger
                className={`w-[110px] ${size === "sm" ? "h-8 text-xs" : ""} ${className}`}
                data-testid="select-sport-filter"
            >
                <SelectValue>
                    <span className="flex items-center gap-1.5">
                        <span>{SPORT_DISPLAY[sport].icon}</span>
                        <span>{SPORT_DISPLAY[sport].name}</span>
                    </span>
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {SPORTS.map((s) => {
                    const config = SPORT_DISPLAY[s];
                    return (
                        <SelectItem
                            key={s}
                            value={s}
                            disabled={config.disabled}
                            data-testid={`sport-option-${s.toLowerCase()}`}
                        >
                            <span className="flex items-center gap-1.5">
                                <span>{config.icon}</span>
                                <span>{config.name}</span>
                            </span>
                        </SelectItem>
                    );
                })}
            </SelectContent>
        </Select>
    );
}

/**
 * Compact sport toggle for use in headers
 */
export function SportToggle({ className = "" }: { className?: string }) {
    const { sport, setSport } = useSport();

    const toggle = () => {
        const currentIndex = SPORTS.indexOf(sport);
        const nextIndex = (currentIndex + 1) % SPORTS.length;
        setSport(SPORTS[nextIndex]);
    };

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            className={`px-2 ${className}`}
            data-testid="sport-toggle"
            title={`Switch to ${SPORTS[(SPORTS.indexOf(sport) + 1) % SPORTS.length]}`}
        >
            <span className="text-lg">{SPORT_DISPLAY[sport].icon}</span>
        </Button>
    );
}

export default SportSelector;
