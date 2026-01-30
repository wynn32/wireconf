from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, ForeignKey, Table, Column
from typing import List, Optional

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

# Association table for Client <-> Network
client_network_association = Table(
    "client_network",
    Base.metadata,
    Column("client_id", ForeignKey("client.id"), primary_key=True),
    Column("network_id", ForeignKey("network.id"), primary_key=True),
)

class Network(db.Model):
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    cidr: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. 10.0.1.0/24
    interface_address: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. 10.0.1.1 or 10.0.1.1/24

    clients: Mapped[List["Client"]] = relationship(
        secondary=client_network_association, back_populates="networks"
    )

class Client(db.Model):
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    public_key: Mapped[str] = mapped_column(String(100), nullable=False)
    private_key: Mapped[str] = mapped_column(String(100), nullable=False)
    preshared_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # The unique octet (1-254) assigned to this client.
    # This must be the same across all assigned networks.
    octet: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    
    keepalive: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    enabled: Mapped[bool] = mapped_column(default=True)
    
    # DNS Configuration
    # dns_mode: 'default' (use server IPs), 'custom' (use dns_servers), 'none' (no DNS block)
    dns_mode: Mapped[str] = mapped_column(String(20), default='default', nullable=False)
    dns_servers: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # Comma-separated IPs

    networks: Mapped[List["Network"]] = relationship(
        secondary=client_network_association, back_populates="clients"
    )
    
    # Routes where this client is the gateway
    routes: Mapped[List["Route"]] = relationship(back_populates="via_client")

class Route(db.Model):
    """
    Represents a routing rule.
    Traffic for `target_cidr` shoud be routed via `via_client`.
    """
    id: Mapped[int] = mapped_column(primary_key=True)
    target_cidr: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. 192.168.1.0/24
    via_client_id: Mapped[int] = mapped_column(ForeignKey("client.id"), nullable=False)
    
    via_client: Mapped["Client"] = relationship(back_populates="routes")

class AccessRule(db.Model):
    """
    Firewall rule.
    """
    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Source: If null, applies to ALL clients (or handled as logic requires)
    # For now, let's assume we usually specify a source client or it's a general rule.
    # Requirement says "choose which hosts... a client is allowed to access".
    # So usually specific client -> target.
    source_client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("client.id"), nullable=True)

    # Destination can be a client, or a generic CIDR/IP
    dest_client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("client.id"), nullable=True)
    dest_cidr: Mapped[Optional[str]] = mapped_column(String(50), nullable=True) # e.g. 10.0.1.0/24 or 8.8.8.8/32
    
    # Enum: 'network', 'host'
    destination_type: Mapped[str] = mapped_column(String(20), default="host")

    port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    proto: Mapped[str] = mapped_column(String(10), default="udp") # tcp/udp
    action: Mapped[str] = mapped_column(String(10), default="ACCEPT")

class ServerConfig(db.Model):
    """
    Singleton table for server configuration.
    Should only have one row (id=1).
    """
    id: Mapped[int] = mapped_column(primary_key=True)
    
    # Server WireGuard keys
    server_private_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    server_public_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Server endpoint configuration
    server_endpoint: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # e.g. "vpn.example.com:51820"
    server_port: Mapped[int] = mapped_column(Integer, default=51820, nullable=False)
    
    # Setup status flags
    installed: Mapped[bool] = mapped_column(default=False, nullable=False)
    setup_completed: Mapped[bool] = mapped_column(default=False, nullable=False)

