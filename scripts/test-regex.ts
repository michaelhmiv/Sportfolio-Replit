// Test the regex parsing
const status = '12/27 - 8:00 PM EST';

const timeMatch = status.match(/(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:EST|ET)/i);

console.log('Status:', status);
console.log('Match:', timeMatch);

if (timeMatch) {
    const month = parseInt(timeMatch[1]);
    const day = parseInt(timeMatch[2]);
    let hours = parseInt(timeMatch[3]);
    const minutes = parseInt(timeMatch[4]);
    const isPM = timeMatch[5].toUpperCase() === 'PM';

    console.log(`Parsed: month=${month}, day=${day}, hours=${hours}, minutes=${minutes}, isPM=${isPM}`);

    // Convert to 24-hour format
    if (isPM && hours !== 12) hours += 12;
    else if (!isPM && hours === 12) hours = 0;

    console.log(`24-hour: ${hours}:${minutes}`);

    // EST to UTC
    const year = 2025;
    const estDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0, 0));
    const utcDate = new Date(estDate.getTime() + 5 * 60 * 60 * 1000);

    console.log('EST Date:', estDate.toISOString());
    console.log('UTC Date:', utcDate.toISOString());
    console.log('UTC Hour:', utcDate.getUTCHours());
}
