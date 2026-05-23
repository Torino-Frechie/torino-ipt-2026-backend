export default async function sendEmail({ to, subject, html }: any) {
    const authorizedEmail = 'frechieannt@gmail.com';
    const modifiedHtml = `<p><strong>Note:</strong> This message was intended for: ${to}</p><hr>${html}`;

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Torino App <onboarding@resend.dev>',
                to: [authorizedEmail],
                subject: `[TEST] ${subject}`,
                html: modifiedHtml,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Resend Error:', error);
            throw new Error(`Email failed: ${JSON.stringify(error)}`);
        } else {
            console.log(`Success! Email sent to ${authorizedEmail}`);
        }
    } catch (err) {
        console.error('Network error:', err);
        throw err;
    }
}