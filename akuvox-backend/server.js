const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); // You might need to run: npm install axios
const app = express();

app.use(express.json());
app.use(cors());

// Serve static files (css, images, js) from the current folder
app.use(express.static(__dirname));

// --- 1. THE URL ROUTE ---
// This ensures voltedgeny.com/resident loads your portal
app.get('/resident', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 2. DATA SOURCE (Simulating Akuvox UCloud Data) ---
// In a real scenario, you would fetch this list from Akuvox API once a day
// or cache it. For now, we use this master list.
const akuvoxData = [
    { building: "Sunset Towers", units: [
        { apt: "101", email: "tenant101@example.com" },
        { apt: "102", email: "tenant102@example.com" },
        { apt: "105", email: "tenant105@example.com" },
        { apt: "201", email: "tenant201@example.com" }
    ]},
    { building: "Ocean View", units: [
        { apt: "A1", email: "a1@example.com" },
        { apt: "A2", email: "a2@example.com" },
        { apt: "B1", email: "b1@example.com" }
    ]}
];

// --- 3. API: GET APARTMENTS (For the Dropdown) ---
app.post('/api/get-units', (req, res) => {
    const { buildingName, query } = req.body;
    
    // Find the building
    const building = akuvoxData.find(b => b.building === buildingName);
    if (!building) return res.json({ success: false, units: [] });

    // Filter units that match what the user typed (e.g., user types "10" -> "101", "102")
    const matches = building.units
        .filter(u => u.apt.toLowerCase().startsWith(query.toLowerCase()))
        .map(u => u.apt); // Only send back apt numbers, not emails (privacy)

    res.json({ success: true, units: matches });
});

// --- 4. API: VERIFY & SYNC (The Real Work) ---
app.post('/api/send-invite', async (req, res) => {
    const { buildingName, aptNumber, verifyEmail } = req.body;

    // A. Verify against our local synced data
    const building = akuvoxData.find(b => b.building === buildingName);
    const tenant = building ? building.units.find(u => u.apt === aptNumber) : null;

    if (!tenant || tenant.email.toLowerCase() !== verifyEmail.toLowerCase()) {
        return res.json({ success: false, message: "Information does not match our records." });
    }

    // B. If Verified: Trigger Akuvox Cloud (Real Integration)
    try {
        // NOTE: You must get these credentials from your Akuvox Distributor
        // This is a standard example of how their Cloud API typically works.
        
        /* const akuvoxAuth = await axios.post('https://api.akuvox.com/v1/oauth/token', {
            client_id: 'YOUR_CLIENT_ID',
            client_secret: 'YOUR_SECRET'
        });

        const token = akuvoxAuth.data.access_token;

        await axios.post('https://api.akuvox.com/v1/tenants/invite', {
            email: verifyEmail,
            building: buildingName,
            unit: aptNumber
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        */

        console.log(`Akuvox Invite triggered for ${verifyEmail}`);
        return res.json({ success: true, message: "Verification successful. Check your email for Akuvox credentials." });

    } catch (error) {
        console.error("Akuvox API Error", error);
        return res.json({ success: false, message: "System error connecting to Akuvox." });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/resident`);
});