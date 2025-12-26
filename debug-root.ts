
console.log("Starting debug root...");
try {
    await import("./server/storage");
    console.log("Storage loaded successfully from root.");
} catch (e) {
    console.error("Failed from root:", e);
}
