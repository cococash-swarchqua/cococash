import express from "express";
import routes from "./routes";
import { errorHandler } from "./middlewares/error.middleware";
import healthRoutes from "./routes/health.routes";

const app = express();

app.use(express.json());
app.use("/v1", routes);
app.use(errorHandler);
app.use("/v1", healthRoutes);

export default app;