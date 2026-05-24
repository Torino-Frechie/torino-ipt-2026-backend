import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Op } from "sequelize";
import sendEmail from "../_helpers/send-email";
import db from "../_helpers/db";
import Role from "../_helpers/role";

export default {
    authenticate,
    refreshToken,
    revokeToken,
    register,
    verifyEmail,
    forgotPassword,
    validateResetToken,
    resetPassword,
    getAll,
    getById,
    create,
    update,
    delete: _delete,
};

// --- IMPLEMENTATION FUNCTIONS ---

async function authenticate({ email, password, ipAddress }: any) {
    const account = await db.Account.scope("withHash").findOne({
        where: { email },
    });
    if (
        !account ||
        !account.isVerified ||
        !(await bcrypt.compare(password, account.passwordHash))
    ) {
        throw "Email or password is incorrect";
    }

    const jwtToken = generateJwtToken(account);
    const refreshToken = generateRefreshToken(account, ipAddress);
    await refreshToken.save();

    return {
        ...basicDetails(account),
        jwtToken,
        refreshToken: refreshToken.token,
    };
}

async function refreshToken({ token, ipAddress }: any) {
    const refreshToken = await getRefreshToken(token);
    const account = await refreshToken.getAccount();

    const newRefreshToken = generateRefreshToken(account, ipAddress);
    refreshToken.revoked = new Date();
    refreshToken.revokedByIp = ipAddress;
    refreshToken.replacedByToken = newRefreshToken.token;
    await refreshToken.save();
    await newRefreshToken.save();

    const jwtToken = generateJwtToken(account);
    return {
        ...basicDetails(account),
        jwtToken,
        refreshToken: newRefreshToken.token,
    };
}

async function revokeToken({ token, ipAddress }: any) {
    const refreshToken = await getRefreshToken(token);
    refreshToken.revoked = new Date();
    refreshToken.revokedByIp = ipAddress;
    await refreshToken.save();
}

async function register(params: any, origin: any) {
    if (await db.Account.findOne({ where: { email: params.email } })) {
        return await sendAlreadyRegisteredEmail(params.email, origin);
    }

    const account = new db.Account(params);
    const isFirstAccount = (await db.Account.count()) === 0;
    account.role = isFirstAccount ? Role.Admin : Role.User;
    account.verificationToken = randomTokenString();
    account.passwordHash = await hash(params.password);
    await account.save();

    await sendVerificationEmail(account, origin);
}

async function verifyEmail({ token }: any) {
    const account = await db.Account.findOne({
        where: { verificationToken: token },
    });
    if (!account) throw "Verification failed, you can also verify your account using the forgot password page";
    account.verified = new Date();
    account.verificationToken = null;
    await account.save();
}

async function forgotPassword({ email }: any, origin: any) {
    const account = await db.Account.findOne({ where: { email } });
    if (!account) return;
    account.resetToken = randomTokenString();
    account.resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await account.save();
    await sendPasswordResetEmail(account, origin);
}

async function validateResetToken({ token }: any) {
    const account = await db.Account.findOne({
        where: {
            resetToken: token,
            resetTokenExpires: { [Op.gt]: new Date() },
        },
    });
    if (!account) throw "Invalid token";
    return account;
}

async function resetPassword({ token, password }: any) {
    const account = await validateResetToken({ token });
    account.passwordHash = await hash(password);
    account.passwordReset = new Date();
    account.resetToken = null;
    await account.save();
}

async function getAll() {
    const accounts = await db.Account.findAll();
    return accounts.map((x: any) => basicDetails(x));
}

async function getById(id: any) {
    const account = await getAccount(id);
    return basicDetails(account);
}

async function create(params: any) {
    if (await db.Account.findOne({ where: { email: params.email } })) {
        throw 'Email "' + params.email + '" is already registered';
    }
    const account = new db.Account(params);
    account.verified = new Date();
    account.passwordHash = await hash(params.password);
    await account.save();
    return basicDetails(account);
}

async function update(id: any, params: any) {
    const account = await getAccount(id);
    if (
        params.email &&
        account.email !== params.email &&
        (await db.Account.findOne({ where: { email: params.email } }))
    ) {
        throw 'Email "' + params.email + '" is already taken';
    }
    if (params.password) {
        params.passwordHash = await hash(params.password);
    }
    Object.assign(account, params);
    account.updated = new Date();
    await account.save();
    return basicDetails(account);
}

async function _delete(id: any) {
    const account = await getAccount(id);
    await account.destroy();
}

// --- HELPER FUNCTIONS ---

async function getAccount(id: any) {
    const account = await db.Account.findByPk(id);
    if (!account) throw "Account not found";
    return account;
}

async function getRefreshToken(token: any) {
    const refreshToken = await db.RefreshToken.findOne({ where: { token } });
    if (!refreshToken || !refreshToken.isActive) throw "Invalid token";
    return refreshToken;
}

async function hash(password: any) {
    return await bcrypt.hash(password, 10);
}

function generateJwtToken(account: any) {
    return jwt.sign({ sub: account.id, id: account.id }, process.env.JWT_SECRET || '', {
        expiresIn: "15m",
    });
}

function generateRefreshToken(account: any, ipAddress: any) {
    return new db.RefreshToken({
        accountId: account.id,
        token: randomTokenString(),
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdByIp: ipAddress,
    });
}

function randomTokenString() {
    return crypto.randomUUID();
}

function basicDetails(account: any) {
    const {
        id,
        title,
        firstName,
        lastName,
        email,
        role,
        created,
        updated,
        isVerified,
    } = account;
    return {
        id,
        title,
        firstName,
        lastName,
        email,
        role,
        created,
        updated,
        isVerified,
    };
}

async function sendVerificationEmail(account: any, origin: any) {
    let message;
    if (origin) {
        const verifyUrl = `${origin}/account/verify-email?token=${account.verificationToken}`;
        message = `<p>Thank you for registering! Please click the link below to verify your email address and activate your account:</p>
                   <p><a href="${verifyUrl}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Verify Email Address</a></p>
                   <p>If the button doesn't work, copy and paste this link into your browser:<br>${verifyUrl}</p>`;
    } else {
        message = `<p>Please use the token below to verify your email address:</p>
                   <p><code>${account.verificationToken}</code></p>`;
    }

    await sendEmail({
        to: account.email,
        subject: "Verify Your Account",
        html: `<h4>Welcome!</h4>${message}`,
    });
}

async function sendAlreadyRegisteredEmail(email: any, origin: any) {
    let message;
    if (origin) {
        message = `<p>If you have forgotten your password, you can reset it here: <a href="${origin}/account/forgot-password">Forgot Password</a></p>`;
    } else {
        message = `<p>If you have forgotten your password, you can reset it via the password reset API endpoint.</p>`;
    }

    await sendEmail({
        to: email,
        subject: "Registration Attempt - Email Already Exists",
        html: `<h4>Account Notification</h4><p>The email <strong>${email}</strong> is already registered with our system.</p>${message}`,
    });
}

async function sendPasswordResetEmail(account: any, origin: any) {
    let message;
    if (origin) {
        const resetUrl = `${origin}/account/reset-password?token=${account.resetToken}`;
        message = `<p>We received a request to reset your password. Please click the link below to set a new password. This link is valid for 24 hours:</p>
                   <p><a href="${resetUrl}" style="padding: 10px 20px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
                   <p>If you did not request this, please ignore this email.</p>`;
    } else {
        message = `<p>Please use the token below to reset your password via the API:</p>
                   <p><code>${account.resetToken}</code></p>`;
    }

    await sendEmail({
        to: account.email,
        subject: "Password Reset Request",
        html: `<h4>Reset Your Password</h4>${message}`,
    });
}