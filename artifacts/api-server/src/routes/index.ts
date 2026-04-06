import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import kvRouter from "./kv.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/kv", kvRouter);

export default router;
