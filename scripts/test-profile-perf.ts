import { storage } from './server/storage';

async function testProfile() {
    try {
        const users = await storage.getUsers();
        if (users.length === 0) {
            console.log('No users found');
            return;
        }
        const userId = users[0].id;
        console.log(`Testing profile for user: ${userId}`);

        const startTime = Date.now();
        // Simulate the profile endpoint logic minus the Express part
        const user = await storage.getUser(userId);
        if (!user) {
            console.log('User not found');
            return;
        }

        const userHoldings = await storage.getUserHoldings(user.id);
        const enrichedHoldings = await Promise.all(
            userHoldings.map(async (holding) => {
                if (holding.assetType === "player") {
                    const player = await storage.getPlayer(holding.assetId);
                    return { ...holding, player };
                }
                return holding;
            })
        );

        const allUsers = await storage.getUsers();
        console.log(`Processing rankings for ${allUsers.length} users...`);

        // This is the part that probably crashes
        const sharesVestedRank = allUsers
            .sort((a, b) => b.totalSharesVested - a.totalSharesVested)
            .findIndex((u) => u.id === user.id) + 1;

        console.log(`Calculated rankings in ${Date.now() - startTime}ms`);
        console.log(`Profile logic successful for ${user.username}`);
    } catch (error) {
        console.error('Error in profile test:', error);
    }
}

testProfile();
