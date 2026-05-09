import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import kvRouter from "./kv.js";
import publicRouter from "./public.js";
import authRouter from "./auth.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/kv", kvRouter);
router.use("/public", publicRouter);
router.use("/auth", authRouter);

export default router;
