export default {
    routes: [
        {
            method: "GET",
            path: "/reports/weekly",
            handler: "report.generateWeekly",
            config: {
                policies: [],
                middlewares: [],
            },
        },
    ],
};
