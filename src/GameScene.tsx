import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Html, RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { Shape, Vector3 } from "three";
import type { Group, Mesh, OrthographicCamera } from "three";
import type { Socket } from "socket.io-client";
import type { ItemName, Order, Player, RoomState } from "./types";
import ItemIcon from "./ItemIcon";

const ITEM_META: Record<ItemName | "trash", { label: string; color: string }> = {
  water: { label: "WATER", color: "#55c6ff" },
  soda: { label: "SODA", color: "#f45f72" },
  chips: { label: "CHIPS", color: "#ffc951" },
  meat: { label: "MEAT", color: "#e76a62" },
  fish: { label: "FISH", color: "#5ec4d2" },
  veg: { label: "VEG", color: "#65c96f" },
  trash: { label: "TRASH", color: "#adb6c8" },
};

const seatPosition = (seatId: number): [number, number, number] => {
  const row = Math.floor(seatId / 4);
  const column = seatId % 4;
  return [[-2, -1.05, 1.05, 2][column], 0.18, 5.25 - row * 1.5];
};

function CameraRig({ player }: { player?: Player }) {
  const { camera, size } = useThree((state) => ({
    camera: state.camera as OrthographicCamera,
    size: state.size,
  }));
  const target = useRef(new Vector3());
  const desiredPosition = useRef(new Vector3());

  useFrame(() => {
    // Follow the steward without centering them: the extra rearward bias keeps
    // the long cabin framed below the HUD instead of clipping its tail.
    const focusZ = Math.max(-5.6, Math.min(0, (player?.z ?? 0) * 0.55 - 3.4));
    target.current.set(0, 0.45, focusZ);
    desiredPosition.current.set(7.4, 19.5, focusZ + 11.5);
    camera.position.lerp(desiredPosition.current, 0.075);
    camera.lookAt(target.current);
  });

  useEffect(() => {
    // Keep the same composition on Retina, laptop, and large desktop screens.
    camera.zoom = size.height / 19;
    camera.updateProjectionMatrix();
  }, [camera, size.height]);

  return null;
}

function ItemModel({
  item,
  scale = 1,
}: {
  item: ItemName | "trash";
  scale?: number;
}) {
  if (item === "water" || item === "soda") {
    return (
      <group scale={scale}>
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.12, 0.34, 12]} />
          <meshStandardMaterial
            color={ITEM_META[item].color}
            roughness={0.3}
            metalness={item === "soda" ? 0.35 : 0}
          />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.055, 0.07, 0.08, 10]} />
          <meshStandardMaterial color="#f7fbff" />
        </mesh>
      </group>
    );
  }
  if (item === "meat" || item === "fish" || item === "veg") {
    return (
      <group scale={scale}>
        <mesh position={[0, -0.06, 0]}>
          <cylinderGeometry args={[0.28, 0.24, 0.07, 18]} />
          <meshStandardMaterial color="#f3f0e7" roughness={0.45} />
        </mesh>
        {item === "meat" && (
          <RoundedBox args={[0.3, 0.11, 0.2]} radius={0.07} smoothness={2}>
            <meshStandardMaterial color="#d85b58" />
          </RoundedBox>
        )}
        {item === "fish" && (
          <group>
            <mesh rotation-z={Math.PI / 2}>
              <coneGeometry args={[0.13, 0.38, 12]} />
              <meshStandardMaterial color="#58b8c8" />
            </mesh>
            <mesh position={[-0.22, 0, 0]} rotation-z={-Math.PI / 2}>
              <coneGeometry args={[0.12, 0.2, 3]} />
              <meshStandardMaterial color="#428eaa" />
            </mesh>
          </group>
        )}
        {item === "veg" && (
          <group>
            {[
              [-0.12, 0, 0],
              [0.1, 0.03, 0.08],
              [0.08, 0, -0.1],
            ].map(([x, y, z], index) => (
              <mesh key={index} position={[x, y, z]}>
                <sphereGeometry args={[0.11, 10, 8]} />
                <meshStandardMaterial color={index === 1 ? "#e7b943" : "#58b963"} />
              </mesh>
            ))}
          </group>
        )}
      </group>
    );
  }
  if (item === "chips") {
    return (
      <mesh scale={scale} castShadow>
        <boxGeometry args={[0.3, 0.38, 0.1]} />
        <meshStandardMaterial color="#ffc951" />
      </mesh>
    );
  }
  return (
    <mesh scale={scale} castShadow>
      <cylinderGeometry args={[0.18, 0.15, 0.26, 10]} />
      <meshStandardMaterial color="#576175" />
    </mesh>
  );
}

function CrewMember({
  player,
  isLocal,
  socket,
  mobileVector,
  mobileSqueezing,
  seatPreference,
}: {
  player: Player;
  isLocal: boolean;
  socket: Socket;
  mobileVector: { x: number; z: number };
  mobileSqueezing: boolean;
  seatPreference: "aisle" | "window";
}) {
  const group = useRef<Group>(null);
  const character = useRef<Group>(null);
  const leftLeg = useRef<Mesh>(null);
  const rightLeg = useRef<Mesh>(null);
  const leftArm = useRef<Mesh>(null);
  const rightArm = useRef<Mesh>(null);
  const keys = useRef(new Set<string>());
  const position = useRef({ x: player.x, z: player.z });
  const lastSent = useRef(0);
  const moving = useRef(false);
  const squeezing = useRef(false);

  useEffect(() => {
    if (!isLocal) return;
    const down = (event: KeyboardEvent) => {
      keys.current.add(event.key.toLowerCase());
      if (event.key.toLowerCase() === "f") {
        socket.emit("move", {
          ...position.current,
          facing: group.current?.rotation.y || 0,
          squeezing: true,
        });
      }
      if (event.key === " " || event.key.toLowerCase() === "e") {
        event.preventDefault();
        socket.emit("interact", { seatPreference });
      }
    };
    const up = (event: KeyboardEvent) => {
      keys.current.delete(event.key.toLowerCase());
      if (event.key.toLowerCase() === "f") {
        socket.emit("move", {
          ...position.current,
          facing: group.current?.rotation.y || 0,
          squeezing: false,
        });
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [isLocal, seatPreference, socket]);

  useEffect(() => {
    if (!isLocal) return;
    socket.emit("move", {
      ...position.current,
      facing: group.current?.rotation.y || 0,
      squeezing: mobileSqueezing,
    });
  }, [isLocal, mobileSqueezing, socket]);

  useEffect(() => {
    if (Math.hypot(position.current.x - player.x, position.current.z - player.z) > 0.8) {
      position.current = { x: player.x, z: player.z };
    }
  }, [player.x, player.z]);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (!isLocal) {
      group.current.position.x += (player.x - group.current.position.x) * 0.28;
      group.current.position.z += (player.z - group.current.position.z) * 0.28;
      group.current.rotation.y = player.facing;
      moving.current =
        Math.abs(player.x - group.current.position.x) +
          Math.abs(player.z - group.current.position.z) >
        0.015;
      squeezing.current = player.squeezing;
    } else {
      let dx =
        (keys.current.has("d") || keys.current.has("arrowright") ? 1 : 0) -
        (keys.current.has("a") || keys.current.has("arrowleft") ? 1 : 0) +
        mobileVector.x;
      let dz =
        (keys.current.has("s") || keys.current.has("arrowdown") ? 1 : 0) -
        (keys.current.has("w") || keys.current.has("arrowup") ? 1 : 0) +
        mobileVector.z;
      squeezing.current = keys.current.has("f") || mobileSqueezing;
      moving.current = Boolean(dx || dz);
      if (dx || dz) {
        const length = Math.hypot(dx, dz);
        dx /= length;
        dz /= length;
        const speed = squeezing.current ? 1.6 : 3.35;
        position.current.x = Math.max(-0.15, Math.min(0.15, position.current.x + dx * delta * speed));
        position.current.z = Math.max(-8.25, Math.min(8.25, position.current.z + dz * delta * speed));
        group.current.rotation.y = Math.atan2(dx, dz);
        if (performance.now() - lastSent.current > 45) {
          socket.emit("move", {
            ...position.current,
            facing: group.current.rotation.y,
            squeezing: squeezing.current,
          });
          lastSent.current = performance.now();
        }
      }
      group.current.position.x = position.current.x;
      group.current.position.z = position.current.z;
    }
    const stride = moving.current ? Math.sin(state.clock.elapsedTime * 14) : 0;
    if (character.current) {
      character.current.position.y = moving.current
        ? Math.abs(Math.sin(state.clock.elapsedTime * 14)) * 0.07
        : 0;
      character.current.rotation.z = moving.current ? stride * 0.035 : 0;
      character.current.rotation.x +=
        ((moving.current ? -0.1 : 0) - character.current.rotation.x) * 0.18;
      character.current.rotation.y +=
        ((squeezing.current ? Math.PI / 2 : 0) - character.current.rotation.y) * 0.22;
      character.current.scale.x +=
        ((squeezing.current ? 0.7 : 1) - character.current.scale.x) * 0.22;
      character.current.scale.y =
        1 + (moving.current ? Math.abs(stride) * 0.045 : 0);
    }
    if (leftLeg.current) leftLeg.current.rotation.x = stride * 0.55;
    if (rightLeg.current) rightLeg.current.rotation.x = -stride * 0.55;
    if (leftArm.current) leftArm.current.rotation.x = -stride * 0.48;
    if (rightArm.current) rightArm.current.rotation.x = stride * 0.48;
  });

  return (
    <group ref={group} position={[player.x, 0.24, player.z]} rotation-y={player.facing}>
      {isLocal && (
        <mesh position={[0, 0.04, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.32, 0.43, 20]} />
          <meshBasicMaterial color="#ffe45d" />
        </mesh>
      )}
      <group ref={character}>
        <mesh ref={leftLeg} position={[-0.13, 0.27, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.28, 5, 8]} />
          <meshStandardMaterial color="#26385f" />
        </mesh>
        <mesh ref={rightLeg} position={[0.13, 0.27, 0]} castShadow>
          <capsuleGeometry args={[0.085, 0.28, 5, 8]} />
          <meshStandardMaterial color="#26385f" />
        </mesh>
        <RoundedBox args={[0.55, 0.66, 0.36]} radius={0.14} smoothness={3} position={[0, 0.72, 0]} castShadow>
          <meshStandardMaterial color={player.color} roughness={0.55} />
        </RoundedBox>
        {player.avatar === "female" ? (
          <mesh position={[0, 0.48, 0]} castShadow>
            <cylinderGeometry args={[0.24, 0.34, 0.38, 12]} />
            <meshStandardMaterial color={player.color} roughness={0.58} />
          </mesh>
        ) : (
          <group>
            <RoundedBox args={[0.24, 0.34, 0.34]} radius={0.05} smoothness={2} position={[-0.13, 0.5, 0]} castShadow>
              <meshStandardMaterial color={player.color} roughness={0.58} />
            </RoundedBox>
            <RoundedBox args={[0.24, 0.34, 0.34]} radius={0.05} smoothness={2} position={[0.13, 0.5, 0]} castShadow>
              <meshStandardMaterial color={player.color} roughness={0.58} />
            </RoundedBox>
          </group>
        )}
        <RoundedBox args={[0.18, 0.38, 0.035]} radius={0.025} smoothness={2} position={[0, 0.82, 0.2]}>
          <meshStandardMaterial color="#fffaf0" />
        </RoundedBox>
        <mesh position={[-0.09, 0.91, 0.225]} rotation-z={-0.48}>
          <boxGeometry args={[0.14, 0.25, 0.025]} />
          <meshStandardMaterial color="#fffaf0" />
        </mesh>
        <mesh position={[0.09, 0.91, 0.225]} rotation-z={0.48}>
          <boxGeometry args={[0.14, 0.25, 0.025]} />
          <meshStandardMaterial color="#fffaf0" />
        </mesh>
        <mesh position={[0, 0.56, 0.205]}>
          <boxGeometry args={[0.49, 0.065, 0.035]} />
          <meshStandardMaterial color="#26385f" />
        </mesh>
        {player.avatar === "male" && (
          <group position={[0, 0.84, 0.235]}>
            <mesh rotation-z={Math.PI}>
              <coneGeometry args={[0.055, 0.24, 4]} />
              <meshStandardMaterial color="#e84f66" />
            </mesh>
            <mesh position={[0, 0.14, 0]}>
              <sphereGeometry args={[0.055, 8, 6]} />
              <meshStandardMaterial color="#e84f66" />
            </mesh>
          </group>
        )}
        <mesh ref={leftArm} position={[-0.34, 0.75, 0]} rotation-z={-0.15} castShadow>
          <capsuleGeometry args={[0.07, 0.34, 5, 8]} />
          <meshStandardMaterial color={player.color} />
        </mesh>
        <mesh ref={rightArm} position={[0.34, 0.75, 0]} rotation-z={0.15} castShadow>
          <capsuleGeometry args={[0.07, 0.34, 5, 8]} />
          <meshStandardMaterial color={player.color} />
        </mesh>
        <mesh position={[0, 1.21, 0]} castShadow>
          <sphereGeometry args={[0.27, 16, 12]} />
          <meshStandardMaterial color="#f2b58d" />
        </mesh>
        <mesh position={[0, 1.35, -0.04]} castShadow>
          <sphereGeometry args={[0.275, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={["#392a28", "#e2a33d", "#5b382c"][player.id.charCodeAt(0) % 3]} />
        </mesh>
        {player.avatar === "female" && (
          <>
            <mesh position={[0, 1.2, -0.24]} castShadow>
              <sphereGeometry args={[0.13, 12, 9]} />
              <meshStandardMaterial color={["#392a28", "#e2a33d", "#5b382c"][player.id.charCodeAt(0) % 3]} />
            </mesh>
            <mesh position={[0, 1.01, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.13, 0.033, 7, 16]} />
              <meshStandardMaterial color="#e84f66" />
            </mesh>
            <mesh position={[0, 1.53, -0.015]} castShadow>
              <cylinderGeometry args={[0.19, 0.22, 0.1, 16]} />
              <meshStandardMaterial color={player.color} roughness={0.5} />
            </mesh>
            <mesh position={[0, 1.47, 0.08]}>
              <boxGeometry args={[0.47, 0.035, 0.27]} />
              <meshStandardMaterial color={player.color} />
            </mesh>
            <mesh position={[0, 1.53, 0.185]}>
              <boxGeometry args={[0.13, 0.035, 0.018]} />
              <meshStandardMaterial color="#ffe06b" metalness={0.25} />
            </mesh>
          </>
        )}
        <mesh position={[-0.095, 1.23, 0.245]}>
          <sphereGeometry args={[0.027, 8, 6]} />
          <meshBasicMaterial color="#1b2340" />
        </mesh>
        <mesh position={[0.095, 1.23, 0.245]}>
          <sphereGeometry args={[0.027, 8, 6]} />
          <meshBasicMaterial color="#1b2340" />
        </mesh>
        <mesh position={[0, 0.85, 0.19]}>
          <boxGeometry args={[0.29, 0.1, 0.035]} />
          <meshStandardMaterial color="#ffe06b" />
        </mesh>
        {player.held.length > 0 && (
          <group position={[0, 0.9, 0.48]}>
            <mesh position={[0, -0.12, 0]} castShadow>
              <cylinderGeometry args={[0.42, 0.42, 0.055, 18]} />
              <meshStandardMaterial color="#dce3ec" metalness={0.5} roughness={0.25} />
            </mesh>
            {player.held.map((heldItem, index) => (
              <group
                key={`${heldItem.item}-${index}`}
                position={[(index - (player.held.length - 1) / 2) * 0.25, 0, 0]}
              >
                <ItemModel item={heldItem.item} scale={0.95} />
              </group>
            ))}
            <Html center position={[0, 0.78, 0]}>
              <div className="held-item">
                <b>TRAY {player.held.length}/3</b>
                <div className="held-items-icons">
                  {player.held.map((heldItem, index) => (
                    <ItemIcon item={heldItem.item} size={30} key={`${heldItem.item}-${index}`} />
                  ))}
                </div>
              </div>
            </Html>
          </group>
        )}
      </group>
      <Html center position={[0, 1.9, 0]}>
        <div className={`name-tag ${isLocal ? "local" : ""}`}>
          {isLocal ? "YOU" : player.name}
        </div>
      </Html>
    </group>
  );
}

function PassengerSeat({ seatId, order }: { seatId: number; order?: Order }) {
  const [x, y, z] = seatPosition(seatId);
  const remaining = order?.items.filter((item) => !order.served.includes(item));
  const expiring = Boolean(order && order.expiresAt - Date.now() <= 3000);
  const fabric = order ? "#526ed0" : seatId % 2 ? "#355387" : "#3d5d95";
  const skin = ["#8f5e45", "#e5ac7c", "#6f4637", "#d79a72"][seatId % 4];
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 0.22, 10]} />
        <meshStandardMaterial color="#8993a6" metalness={0.55} roughness={0.3} />
      </mesh>
      <RoundedBox args={[0.78, 0.22, 0.68]} radius={0.1} smoothness={3} position={[0, 0.28, 0.05]} castShadow>
        <meshStandardMaterial color={fabric} roughness={0.7} />
      </RoundedBox>
      <RoundedBox args={[0.78, 0.88, 0.22]} radius={0.1} smoothness={3} position={[0, 0.72, -0.25]} castShadow>
        <meshStandardMaterial color={fabric} roughness={0.68} />
      </RoundedBox>
      <RoundedBox args={[0.58, 0.24, 0.16]} radius={0.07} smoothness={3} position={[0, 1.13, -0.25]}>
        <meshStandardMaterial color="#dce5ef" />
      </RoundedBox>
      {[-0.45, 0.45].map((armX) => (
        <group key={armX}>
          <mesh position={[armX, 0.44, 0]}>
            <boxGeometry args={[0.08, 0.09, 0.62]} />
            <meshStandardMaterial color="#283d68" />
          </mesh>
          <mesh position={[armX, 0.22, -0.15]}>
            <cylinderGeometry args={[0.035, 0.035, 0.38, 8]} />
            <meshStandardMaterial color="#7d879a" metalness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.65, 0.03]} castShadow>
        <capsuleGeometry args={[0.18, 0.3, 5, 10]} />
        <meshStandardMaterial color={["#d96572", "#e0a345", "#58a184", "#806fc2"][seatId % 4]} />
      </mesh>
      <mesh position={[0, 1.01, 0.04]} castShadow>
        <sphereGeometry args={[0.2, 14, 10]} />
        <meshStandardMaterial color={skin} />
      </mesh>
      <mesh position={[0, 1.12, 0]} castShadow>
        <sphereGeometry args={[0.205, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={["#392a28", "#c78d39", "#2a2221"][seatId % 3]} />
      </mesh>
      <mesh position={[-0.07, 1.01, 0.22]}>
        <sphereGeometry args={[0.018, 7, 5]} />
        <meshBasicMaterial color="#19213a" />
      </mesh>
      <mesh position={[0.07, 1.01, 0.22]}>
        <sphereGeometry args={[0.018, 7, 5]} />
        <meshBasicMaterial color="#19213a" />
      </mesh>
      {order && remaining && (
        <Html center position={[0, 1.55, 0]}>
          <div className={`order-bubble ${expiring ? "expiring" : ""}`}>
            <small>{seatId % 4 === 0 || seatId % 4 === 3 ? "WINDOW" : "AISLE"}</small>
            <div>
              {remaining.map((item) => (
                <span className="order-icon" key={item}>
                  <ItemIcon item={item} size={36} />
                </span>
              ))}
            </div>
            <span
              className="patience"
              style={{
                width: `${Math.max(0, Math.min(100, ((order.expiresAt - Date.now()) / 42000) * 100))}%`,
              }}
            />
          </div>
        </Html>
      )}
    </group>
  );
}

function Supply({
  item,
  position,
  label,
}: {
  item: ItemName;
  position: [number, number, number];
  label: string;
}) {
  return (
    <group position={position}>
      <RoundedBox args={[1.08, 0.88, 0.9]} radius={0.09} smoothness={3} castShadow>
        <meshStandardMaterial color="#eef2f4" roughness={0.48} metalness={0.08} />
      </RoundedBox>
      <RoundedBox args={[0.88, 0.48, 0.035]} radius={0.04} smoothness={2} position={[0, -0.08, 0.47]}>
        <meshStandardMaterial color={ITEM_META[item].color} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0.47, 0]}>
        <boxGeometry args={[1.16, 0.09, 0.98]} />
        <meshStandardMaterial color="#758398" metalness={0.65} roughness={0.22} />
      </mesh>
      <mesh position={[0, -0.25, 0.49]}>
        <boxGeometry args={[0.035, 0.32, 0.025]} />
        <meshStandardMaterial color="#273653" />
      </mesh>
      <group position={[0, 0.68, 0.04]}>
        <ItemModel item={item} scale={2.05} />
      </group>
      <Html center position={[0, 1.24, 0]}>
        <div className="supply-label">
          <ItemIcon item={item} size={28} />
          {label}
        </div>
      </Html>
    </group>
  );
}

function AircraftBody() {
  const fuselage = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-3.1, -7.8);
    shape.quadraticCurveTo(-2.7, -9.15, 0, -9.55);
    shape.quadraticCurveTo(2.7, -9.15, 3.1, -7.8);
    shape.lineTo(3.1, 7.55);
    shape.quadraticCurveTo(2.65, 9.15, 0, 9.7);
    shape.quadraticCurveTo(-2.65, 9.15, -3.1, 7.55);
    shape.closePath();
    return shape;
  }, []);
  const leftWing = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-2.75, 2.1);
    shape.lineTo(-7.6, -0.8);
    shape.quadraticCurveTo(-7.9, -1.2, -7.35, -1.55);
    shape.lineTo(-2.75, -0.55);
    shape.closePath();
    return shape;
  }, []);
  const rightWing = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(2.75, 2.1);
    shape.lineTo(7.6, -0.8);
    shape.quadraticCurveTo(7.9, -1.2, 7.35, -1.55);
    shape.lineTo(2.75, -0.55);
    shape.closePath();
    return shape;
  }, []);
  const leftTail = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-2.5, -7.2);
    shape.lineTo(-5.1, -8.15);
    shape.lineTo(-4.9, -8.85);
    shape.lineTo(-2.1, -8.25);
    shape.closePath();
    return shape;
  }, []);
  const rightTail = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(2.5, -7.2);
    shape.lineTo(5.1, -8.15);
    shape.lineTo(4.9, -8.85);
    shape.lineTo(2.1, -8.25);
    shape.closePath();
    return shape;
  }, []);

  return (
    <group>
      <mesh rotation-x={Math.PI / 2} position={[0, 0.2, 0]} receiveShadow castShadow>
        <extrudeGeometry
          args={[fuselage, { depth: 0.32, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.08, bevelSegments: 3 }]}
        />
        <meshStandardMaterial color="#dce6ec" roughness={0.56} />
      </mesh>
      {[leftWing, rightWing, leftTail, rightTail].map((shape, index) => (
        <mesh key={index} rotation-x={Math.PI / 2} position={[0, -0.03, 0]} receiveShadow>
          <shapeGeometry args={[shape]} />
          <meshStandardMaterial color={index < 2 ? "#cbd9e3" : "#d6e2e9"} roughness={0.5} side={2} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, -8.55]} rotation-x={-0.12}>
        <boxGeometry args={[0.13, 1.8, 1.65]} />
        <meshStandardMaterial color="#4264b6" roughness={0.48} />
      </mesh>
      <mesh position={[0, 1.12, -9.05]} rotation-x={-0.12}>
        <boxGeometry args={[0.15, 0.72, 0.72]} />
        <meshStandardMaterial color="#ff5d73" />
      </mesh>
      {[-4.55, 4.55].map((x) => (
        <group key={`engine-${x}`} position={[x, 0.02, -0.15]}>
          <mesh rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.48, 0.6, 1.8, 24]} />
            <meshStandardMaterial color="#dce5eb" metalness={0.2} roughness={0.42} />
          </mesh>
          <mesh position={[0, 0, 0.91]}>
            <torusGeometry args={[0.42, 0.11, 10, 24]} />
            <meshStandardMaterial color="#4264b6" metalness={0.28} />
          </mesh>
          <mesh position={[0, 0, 0.92]}>
            <circleGeometry args={[0.31, 20]} />
            <meshStandardMaterial color="#182748" metalness={0.5} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={`cockpit-${side}`} position={[side * 0.78, 0.42, 8.87]} rotation-y={side * -0.18}>
          <RoundedBox args={[1.18, 0.08, 0.72]} radius={0.16} smoothness={4}>
            <meshStandardMaterial color="#244875" metalness={0.25} roughness={0.2} />
          </RoundedBox>
          <mesh position={[0, 0.05, -0.04]}>
            <boxGeometry args={[0.055, 0.025, 0.57]} />
            <meshStandardMaterial color="#86d9ef" emissive="#55b5d5" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`winglet-${side}`} position={[side * 7.35, 0.28, -1.08]} rotation-z={side * -0.22}>
          <boxGeometry args={[0.16, 0.62, 0.78]} />
          <meshStandardMaterial color="#ff5d73" />
        </mesh>
      ))}
    </group>
  );
}

function Cabin({
  room,
  playerId,
  socket,
  mobileVector,
  mobileSqueezing,
  seatPreference,
}: {
  room: RoomState;
  playerId: string;
  socket: Socket;
  mobileVector: { x: number; z: number };
  mobileSqueezing: boolean;
  seatPreference: "aisle" | "window";
}) {
  const orderBySeat = useMemo(
    () => new Map(room.orders.map((order) => [order.seatId, order])),
    [room.orders],
  );

  return (
    <>
      <color attach="background" args={["#91d8ef"]} />
      <fog attach="fog" args={["#91d8ef", 23, 42]} />
      <ambientLight intensity={1.8} />
      <directionalLight
        position={[-7, 14, 9]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <Environment preset="city" />

      <group scale={1.08}>
        <AircraftBody />
        {[-3.05, 3.05].map((x) => (
          <group key={x}>
            <RoundedBox
              args={[0.22, x > 0 ? 0.48 : 1.55, 18]}
              radius={0.1}
              smoothness={3}
              position={[x, x > 0 ? 0.25 : 0.8, 0]}
              castShadow
            >
              <meshStandardMaterial color="#f4f7fa" roughness={0.52} />
            </RoundedBox>
            <mesh position={[x - Math.sign(x) * 0.13, 0.43, 0]}>
              <boxGeometry args={[0.04, 0.12, 17.7]} />
              <meshStandardMaterial color="#4264b6" />
            </mesh>
            {x < 0 && Array.from({ length: 8 }, (_, row) => (
              <group key={row} position={[x - Math.sign(x) * 0.12, 1.02, 5.25 - row * 1.5]}>
                <mesh rotation-y={Math.PI / 2}>
                  <capsuleGeometry args={[0.19, 0.28, 5, 10]} />
                  <meshStandardMaterial color="#68c9ee" emissive="#318cb5" emissiveIntensity={0.18} />
                </mesh>
                <mesh position={[-Math.sign(x) * 0.02, -0.37, 0]}>
                  <boxGeometry args={[0.08, 0.06, 0.62]} />
                  <meshStandardMaterial color="#b8c5d0" />
                </mesh>
              </group>
            ))}
          </group>
        ))}
        {[4.6, 1.55, -1.5, -4.55].map((z) => (
          <RoundedBox
            key={`bin-${z}`}
            args={[0.62, 0.42, 2.65]}
            radius={0.12}
            smoothness={3}
            position={[-2.63, 1.62, z]}
            castShadow
          >
            <meshStandardMaterial color="#e9eef2" roughness={0.5} />
          </RoundedBox>
        ))}
        {[7.55, -7.55].map((z) => (
          <group key={`door-${z}`} position={[-3.04, 0.95, z]}>
            <RoundedBox args={[0.06, 1.28, 1.05]} radius={0.12} smoothness={3}>
              <meshStandardMaterial color="#d7e0e6" />
            </RoundedBox>
            <mesh position={[-0.05, 0, 0]}>
              <torusGeometry args={[0.15, 0.025, 8, 18]} />
              <meshStandardMaterial color="#e95c71" />
            </mesh>
          </group>
        ))}
        <RoundedBox args={[5.95, 0.42, 0.3]} radius={0.12} smoothness={3} position={[0, 0.22, 9.05]}>
          <meshStandardMaterial color="#f4f7fa" />
        </RoundedBox>
        <RoundedBox args={[5.95, 1.05, 0.3]} radius={0.12} smoothness={3} position={[0, 0.65, -9.05]}>
          <meshStandardMaterial color="#f4f7fa" />
        </RoundedBox>
        <RoundedBox args={[1.1, 0.07, 17.5]} radius={0.035} smoothness={2} position={[0, 0.26, 0]}>
          <meshStandardMaterial
            color="#1e326b"
            roughness={0.96}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </RoundedBox>
        <mesh position={[-0.58, 0.31, 0]}>
          <boxGeometry args={[0.035, 0.025, 17.3]} />
          <meshStandardMaterial color="#d5af4d" />
        </mesh>
        <mesh position={[0.58, 0.31, 0]}>
          <boxGeometry args={[0.035, 0.025, 17.3]} />
          <meshStandardMaterial color="#d5af4d" />
        </mesh>
        {Array.from({ length: 8 }, (_, row) => (
          <mesh key={`stripe-${row}`} position={[0, 0.307, 5.25 - row * 1.5]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.08, 0.035]} />
            <meshBasicMaterial
              color="#5570aa"
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
            />
          </mesh>
        ))}
        {Array.from({ length: 32 }, (_, seatId) => (
          <PassengerSeat key={seatId} seatId={seatId} order={orderBySeat.get(seatId)} />
        ))}
        <Supply item="water" label="WATER" position={[-1.25, 0.55, 7.3]} />
        <Supply item="soda" label="SODA" position={[1.25, 0.55, 7.3]} />
        <Supply item="chips" label="SNACKS" position={[-1.25, 0.55, -7.3]} />
        <Supply item="meat" label="MEAT" position={[1.25, 0.55, -6.35]} />
        <Supply item="fish" label="FISH" position={[1.25, 0.55, -7.3]} />
        <Supply item="veg" label="VEG" position={[1.25, 0.55, -8.25]} />
        <group position={[0, 0.25, 8.65]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.48, 0.42, 0.72, 16]} />
            <meshStandardMaterial color="#e84f66" />
          </mesh>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.54, 0.54, 0.12, 16]} />
            <meshStandardMaterial color="#273352" />
          </mesh>
          <mesh position={[0, 0.47, 0.05]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.35, 16]} />
            <meshStandardMaterial color="#101b35" />
          </mesh>
          <Html center position={[0, 0.98, 0]}>
            <div className="trash-label"><ItemIcon item="trash" size={32} /> TRASH BIN</div>
          </Html>
        </group>
        {room.messes.map((mess) => (
          <group key={mess.id} position={[mess.x, 0.28, mess.z]}>
            <mesh rotation-x={-Math.PI / 2}>
              <circleGeometry args={[0.38, 16]} />
              <meshStandardMaterial color="#f4cf5e" />
            </mesh>
            <mesh position={[0, 0.2, 0]} castShadow>
              <dodecahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color="#596579" />
            </mesh>
            <Html center position={[0, 0.62, 0]}>
              <div className="mess">
                <ItemIcon item="trash" size={38} />
                <b>PICK UP</b>
              </div>
            </Html>
          </group>
        ))}
        {room.players.map((player) => (
          <CrewMember
            key={player.id}
            player={player}
            isLocal={player.id === playerId}
            socket={socket}
            mobileVector={player.id === playerId ? mobileVector : { x: 0, z: 0 }}
            mobileSqueezing={player.id === playerId && mobileSqueezing}
            seatPreference={seatPreference}
          />
        ))}
      </group>
    </>
  );
}

export default function GameScene(props: {
  room: RoomState;
  playerId: string;
  socket: Socket;
  mobileVector: { x: number; z: number };
  mobileSqueezing: boolean;
  seatPreference: "aisle" | "window";
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.6]}
      orthographic
      camera={{ position: [7.4, 19.5, 11.5], zoom: 48, near: 0.1, far: 100 }}
      gl={{ antialias: true }}
    >
      <CameraRig player={props.room.players.find((player) => player.id === props.playerId)} />
      <Cabin {...props} />
    </Canvas>
  );
}
