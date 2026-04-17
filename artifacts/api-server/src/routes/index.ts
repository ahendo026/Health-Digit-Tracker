import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import uploadsRouter from "./uploads";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(uploadsRouter);
router.use(adminRouter);

export default router;
