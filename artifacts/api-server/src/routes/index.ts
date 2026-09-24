import { Router, type IRouter } from "express";
import healthRouter from "./health";
import waveRouter from "./wave";

const router: IRouter = Router();

router.use(healthRouter);
router.use(waveRouter);

export default router;
