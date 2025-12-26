import axios from "axios";

async function testNFL() {
    const apiKey = "dd65e89d-74be-4cf2-84b2-297eb6ec3ae8"; // I'll use the one I saw in a previous turn or just try process.env
    // Actually, I'll try to get it from process.env first
    const key = process.env.BALLDONTLIE_API_KEY || apiKey;

    if (!key) {
        console.error("BALLDONTLIE_API_KEY not set");
        return;
    }

    try {
        const response = await axios.get("https://api.balldontlie.io/nfl/v1/games", {
            headers: { "Authorization": key },
            params: { seasons: [2024], weeks: [17], per_page: 5 }
        });

        if (response.data.data && response.data.data.length > 0) {
            const game = response.data.data[0];
            console.log("GAME KEYS:", Object.keys(game));
            console.log("VISITOR TEAM:", game.visitor_team);
            console.log("HOME TEAM:", game.home_team);
            console.log("STATUS:", game.status);
            console.log("DATE:", game.date);
        }
    } catch (error: any) {
        console.error("API Error:", error.response?.data || error.message);
    }
}

testNFL();
