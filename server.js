import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 5000;

app.get("/", (req, res) => {
res.json({
message: "EllisTaskLink Backend Running"
});
});

app.post("/api/register", async (req, res) => {
const { fullName, email, password } = req.body;

const users = JSON.parse(fs.readFileSync("users.json"));

const existingUser = users.find(user => user.email === email);

if (existingUser) {
return res.json({
message: "User already exists"
});
}

const hashedPassword = await bcrypt.hash(password, 10);

const newUser = {
id: Date.now(),
fullName,
email,
password: hashedPassword,
membershipPaid: false,
balance: 0
};

users.push(newUser);

fs.writeFileSync("users.json", JSON.stringify(users, null, 2));

res.json({
message: "Account created successfully"
});
});

app.post("/api/login", async (req, res) => {
const { email, password } = req.body;

const users = JSON.parse(fs.readFileSync("users.json"));

const user = users.find(user => user.email === email);

if (!user) {
return res.json({
message: "User not found"
});
}

const validPassword = await bcrypt.compare(password, user.password);

if (!validPassword) {
return res.json({
message: "Invalid password"
});
}

const token = jwt.sign(
{ id: user.id },
process.env.JWT_SECRET
);

res.json({
token,
user
});
});

app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});
