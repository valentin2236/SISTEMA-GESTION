import { Router } from "express";
import bwipjs from "bwip-js";

const router = Router();

// =====================================
// GET /api/barcode/:sku
// =====================================

router.get("/:sku", async (req, res) => {

  try {

    const { sku } = req.params;

    const png = await bwipjs.toBuffer({

      bcid: "code128",

      text: sku,

      scale: 3,

      height: 10,

      includetext: true,

      textxalign: "center",

    });

    res.set("Content-Type", "image/png");

    res.send(png);

  } catch (error) {

    console.error(error);

    res.status(500).send("ERROR_BARCODE");

  }

});

export default router;