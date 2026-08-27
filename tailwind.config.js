/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './web/app.html',
        './web/**/*.js',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                primary: '#10B981',
                secondary: '#3B82F6',
                dark: '#0F172A',
            },
            boxShadow: {
                premium: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
                float: '0 10px 40px -10px rgba(0, 0, 0, 0.08)',
            },
        },
    },
    plugins: [],
};
