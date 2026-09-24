/*
 * Portions of this file are derived from Aetheria (https://github.com/venymlabs/aetheria),
 * Copyright Venym Labs, licensed under the Apache License, Version 2.0.
 * See NOTICE and licenses/APACHE-2.0.txt. Modified for RetifyOS.
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * How liquidity is spread across the levels of a position.
 *  - `spot`    uniform across the range (the default; lowest maintenance)
 *  - `curve`   concentrated at the active level (max fee capture, max IL)
 *  - `bid-ask` concentrated at the range edges (mean-reversion / exit ladder)
 */
export const LIQUIDITY_SHAPES = ["spot", "curve", "bid-ask"];
